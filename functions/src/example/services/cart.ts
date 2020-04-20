import * as admin from 'firebase-admin'
import { CartItem, CartItemEditResponse, Product, CartItemAddInput as _AddCartItemInput, CartItemUpdateInput as _UpdateCartItemInput } from './types'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { InputValidationError, WriteReadyObserver, validate } from '../../lib'
import { RequiredDocumentSnapshot, getDocumentById } from '../../lib/base'
import { IsPositive } from 'class-validator'
import { Transaction } from '@google-cloud/firestore'

export class CartItemUpdateInput implements _UpdateCartItemInput {
  id!: string

  @IsPositive()
  quantity!: number
}

export class CartItemAddInput implements _AddCartItemInput {
  productId!: string

  title!: string

  @IsPositive()
  price!: number

  @IsPositive()
  quantity!: number
}

@Injectable()
class CartService {
  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  async findList(user: { uid: string }, ids?: string[]): Promise<CartItem[]> {
    const db = admin.firestore()

    if (ids && ids.length) {
      const itemDict: { [id: string]: CartItem } = {}
      const promises: Promise<void>[] = []
      for (const id of ids) {
        promises.push(
          (async () => {
            const doc = await db.collection('cart').doc(id).get()
            if (doc.exists) {
              itemDict[doc.id] = { id: doc.id, ...doc.data() } as CartItem
            }
          })()
        )
      }
      await Promise.all(promises)

      return ids.reduce<CartItem[]>((result, id) => {
        const item = itemDict[id]
        item && result.push(item)
        return result
      }, [])
    } else {
      const items: CartItem[] = []
      const snapshot = await db.collection('cart').where('uid', '==', user.uid).get()
      snapshot.forEach(doc => {
        items.push({ id: doc.id, ...doc.data() } as CartItem)
      })
      return items
    }
  }

  async addList(user: { uid: string }, inputs: CartItemAddInput[]): Promise<CartItemEditResponse[]> {
    await validate(CartItemAddInput, inputs)

    const db = admin.firestore()
    return await db.runTransaction(async transaction => {
      const writeReady = new WriteReadyObserver(inputs.length)
      const promises: Promise<CartItemEditResponse>[] = []
      for (const input of inputs) {
        promises.push(this.m_addCartItem(transaction, input, user.uid, writeReady))
      }
      return await Promise.all<CartItemEditResponse>(promises)
    })
  }

  async updateList(user: { uid: string }, inputs: CartItemUpdateInput[]): Promise<CartItemEditResponse[]> {
    await validate(CartItemUpdateInput, inputs)

    const db = admin.firestore()
    return await db.runTransaction(async transaction => {
      const writeReady = new WriteReadyObserver(inputs.length)
      const promises: Promise<CartItemEditResponse>[] = []
      for (const input of inputs) {
        promises.push(this.m_updateCartItem(transaction, input, user.uid, writeReady))
      }
      return await Promise.all<CartItemEditResponse>(promises)
    })
  }

  async removeList(user: { uid: string }, ids: string[]): Promise<CartItemEditResponse[]> {
    if (!user) throw new ForbiddenException()

    const db = admin.firestore()
    return await db.runTransaction(async transaction => {
      const writeReady = new WriteReadyObserver(ids.length)
      const promises: Promise<CartItemEditResponse>[] = []
      for (const cartItemId of ids) {
        promises.push(this.m_removeCartItem(transaction, cartItemId, user.uid, writeReady))
      }
      return await Promise.all<CartItemEditResponse>(promises)
    })
  }

  async checkoutCart(user: { uid: string }): Promise<boolean> {
    const db = admin.firestore()

    const snapshot = await db.collection('cart').where('uid', '==', user.uid).get()

    await db.runTransaction(async transaction => {
      snapshot.forEach(doc => {
        transaction.delete(doc.ref)
      })
    })

    return true
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  /**
   * カートにアイテムを追加します。
   * @param transaction
   * @param itemInput
   * @param uid
   * @param writeReady
   */
  private async m_addCartItem(
    transaction: Transaction,
    itemInput: CartItemAddInput,
    uid: string,
    writeReady: WriteReadyObserver
  ): Promise<CartItemEditResponse> {
    const db = admin.firestore()

    // 商品を取得
    const productSnap = await this.m_getProductSnapById(itemInput.productId, transaction)
    const product = productSnap.data()

    // 追加しようとするカートアイテムが存在しないことをチェック
    const query = db.collection('cart').where('uid', '==', uid).where('productId', '==', itemInput.productId)
    const snapshot = await transaction.get(query)
    if (snapshot.size > 0) {
      const doc = snapshot.docs[0]
      const cartItem = { id: doc.id, ...doc.data() } as CartItem
      throw new InputValidationError('The specified cart item already exists.', {
        cartItemId: cartItem.id,
        uid: cartItem.uid,
        productId: cartItem.productId,
        title: cartItem.title,
      })
    }

    // 新規カートアイテムの内容を作成
    const cartItemRef = db.collection('cart').doc()
    const newCartItem: CartItem = {
      id: cartItemRef.id,
      uid,
      productId: itemInput.productId,
      title: itemInput.title,
      price: itemInput.price,
      quantity: itemInput.quantity,
    }

    // 商品の在庫数を再計算
    const newStock = product.stock - itemInput.quantity
    if (newStock < 0) {
      throw new InputValidationError('The stock of the product was insufficient.', {
        productId: product.id,
        title: product.title,
        currentStock: product.stock,
        addedQuantity: itemInput.quantity,
      })
    }

    // 書き込み準備ができるまで待機
    await writeReady.wait()

    // 新規カートアイテム追加を実行
    transaction.create(cartItemRef, newCartItem)
    // 商品の在庫数更新を実行
    product.stock = newStock
    transaction.update(productSnap.ref, product)

    return { ...newCartItem, product }
  }

  /**
   * カートのアイテムを更新します。
   * @param transaction
   * @param input
   * @param uid
   * @param writeReady
   */
  private async m_updateCartItem(
    transaction: Transaction,
    input: CartItemUpdateInput,
    uid: string,
    writeReady: WriteReadyObserver
  ): Promise<CartItemEditResponse> {
    // カートアイテムを取得
    const cartItemSnap = await this.m_getCartItemSnapById(input.id, uid, transaction)
    const cartItem = cartItemSnap.data()

    // 商品を取得
    const productSnap = await this.m_getProductSnapById(cartItem.productId, transaction)
    const product = productSnap.data()

    // 今回カートアイテムに追加された商品の個数を算出
    const addedQuantity = input.quantity - cartItem.quantity

    // 今回カートアイテムに追加された商品の個数をもとに商品の在庫数を算出
    const newStock = product.stock - addedQuantity
    if (newStock < 0) {
      throw new InputValidationError('The stock of the product was insufficient.', {
        productId: product.id,
        title: product.title,
        currentStock: product.stock,
        addedQuantity,
      })
    }

    // 書き込み準備ができるまで待機
    await writeReady.wait()

    // カートアイテム更新を実行
    cartItem.quantity = input.quantity
    transaction.update(cartItemSnap.ref, cartItem)
    // 商品の在庫数更新を実行
    product.stock = newStock
    transaction.update(productSnap.ref, product)

    return { ...cartItem, product }
  }

  /**
   * カートからアイテムを削除します。
   * @param transaction
   * @param cartItemId
   * @param uid
   * @param writeReady
   */
  private async m_removeCartItem(
    transaction: Transaction,
    cartItemId: string,
    uid: string,
    writeReady: WriteReadyObserver
  ): Promise<CartItemEditResponse> {
    // カートアイテムを取得
    const cartItemSnap = await this.m_getCartItemSnapById(cartItemId, uid, transaction)
    const cartItem = cartItemSnap.data()

    // 商品を取得
    const productSnap = await this.m_getProductSnapById(cartItem.productId, transaction)
    const product = productSnap.data()
    // 取得した商品の在庫にカートアイテム削除分をプラスする
    const newStock = product.stock + cartItem.quantity

    // 書き込み準備ができるまで待機
    await writeReady.wait()

    // カートアイテムの削除を実行
    transaction.delete(cartItemSnap.ref)
    // 商品の在庫数更新を実行
    product.stock = newStock
    transaction.set(productSnap.ref, product)

    return {
      ...cartItem,
      quantity: 0,
      product,
    }
  }

  private async m_getProductSnapById(id: string, transaction?: Transaction): Promise<RequiredDocumentSnapshot<Product>> {
    const snap = await getDocumentById<Product>('products', id, transaction)
    if (!snap.exists) {
      throw new InputValidationError('The specified product could not be found.', {
        productId: id,
      })
    }
    return snap as RequiredDocumentSnapshot<Product>
  }

  private async m_getCartItemSnapById(id: string, uid: string, transaction?: Transaction): Promise<RequiredDocumentSnapshot<CartItem>> {
    const snap = await getDocumentById<CartItem>('cart', id, transaction)
    if (!snap.exists) {
      throw new InputValidationError('The specified cart item could not be found.', {
        cartItemId: id,
      })
    }
    // 取得したカートアイテムが自身のものかチェック
    const cartItem = snap.data()!
    if (cartItem.uid !== uid) {
      throw new InputValidationError('You cannot access the specified cart item.', {
        cartItemId: cartItem.id,
        uid: cartItem.uid,
        requestUID: uid,
      })
    }
    return snap as RequiredDocumentSnapshot<CartItem>
  }

  private async m_sleep(ms: number): Promise<string> {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(`I slept for ${ms}ms.`)
      }, ms)
    }) as Promise<string>
  }
}

export namespace CartServiceDI {
  export const symbol = Symbol(CartService.name)
  export const provider = {
    provide: symbol,
    useClass: CartService,
  }
  export type type = CartService
}
