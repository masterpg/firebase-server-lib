import * as admin from 'firebase-admin'
import { CartItem, EditCartItemResponse, Product, AddCartItemInput as _AddCartItemInput, UpdateCartItemInput as _UpdateCartItemInput } from './types'
import { DocumentReference, Transaction } from '@google-cloud/firestore'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { InputValidationError, WriteReadyObserver, validate } from '../../lib'
import { IsPositive } from 'class-validator'
const assign = require('lodash/assign')

export class UpdateCartItemInput implements _UpdateCartItemInput {
  id!: string

  @IsPositive()
  quantity!: number
}

export class AddCartItemInput implements _AddCartItemInput {
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

  async addList(user: { uid: string }, inputs: AddCartItemInput[]): Promise<EditCartItemResponse[]> {
    await validate(AddCartItemInput, inputs)

    const db = admin.firestore()
    return await db.runTransaction(async transaction => {
      const writeReady = new WriteReadyObserver(inputs.length)
      const promises: Promise<EditCartItemResponse>[] = []
      for (const input of inputs) {
        promises.push(this.m_addCartItem(transaction, input, user.uid, writeReady))
      }
      return await Promise.all<EditCartItemResponse>(promises)
    })
  }

  async updateList(user: { uid: string }, inputs: UpdateCartItemInput[]): Promise<EditCartItemResponse[]> {
    await validate(UpdateCartItemInput, inputs)

    const db = admin.firestore()
    return await db.runTransaction(async transaction => {
      const writeReady = new WriteReadyObserver(inputs.length)
      const promises: Promise<EditCartItemResponse>[] = []
      for (const input of inputs) {
        promises.push(this.m_updateCartItem(transaction, input, user.uid, writeReady))
      }
      return await Promise.all<EditCartItemResponse>(promises)
    })
  }

  async removeList(user: { uid: string }, ids: string[]): Promise<EditCartItemResponse[]> {
    if (!user) throw new ForbiddenException()

    const db = admin.firestore()
    return await db.runTransaction(async transaction => {
      const writeReady = new WriteReadyObserver(ids.length)
      const promises: Promise<EditCartItemResponse>[] = []
      for (const cartItemId of ids) {
        promises.push(this.m_removeCartItem(transaction, cartItemId, user.uid, writeReady))
      }
      return await Promise.all<EditCartItemResponse>(promises)
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
    itemInput: AddCartItemInput,
    uid: string,
    writeReady: WriteReadyObserver
  ): Promise<EditCartItemResponse> {
    const db = admin.firestore()

    // 商品の取得
    const product = await this.m_getProductById(transaction, itemInput.productId)

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
    const newCartItem = {
      uid,
      productId: itemInput.productId,
      title: itemInput.title,
      price: itemInput.price,
      quantity: itemInput.quantity,
    }

    // 商品の在庫数を再計算
    const newStock = product.data.stock - itemInput.quantity
    if (newStock < 0) {
      throw new InputValidationError('The stock of the product was insufficient.', {
        productId: product.data.id,
        title: product.data.title,
        currentStock: product.data.stock,
        addedQuantity: itemInput.quantity,
      })
    }

    // 書き込み準備ができるまで待機
    await writeReady.wait()

    // 新規カートアイテム追加を実行
    transaction.create(cartItemRef, newCartItem)
    // 商品の在庫数更新を実行
    assign(product.data, { stock: newStock })
    transaction.update(product.ref, product.data)

    return {
      id: cartItemRef.id,
      ...newCartItem,
      product: product.data,
    }
  }

  /**
   * カートのアイテムを更新します。
   * @param transaction
   * @param itemInput
   * @param uid
   * @param writeReady
   */
  private async m_updateCartItem(
    transaction: Transaction,
    itemInput: UpdateCartItemInput,
    uid: string,
    writeReady: WriteReadyObserver
  ): Promise<EditCartItemResponse> {
    // カートアイテムを取得
    const cartItem = await this.m_getCartItemById(transaction, itemInput.id)
    // 取得したカートアイテムが自身のものかチェック
    if (cartItem.data.uid !== uid) {
      throw new InputValidationError('You can not access the specified cart item.', {
        cartItemId: cartItem.data.id,
        uid: cartItem.data.uid,
        requestUID: uid,
      })
    }
    // 商品の在庫数を再計算
    const product = await this.m_getProductById(transaction, cartItem.data.productId)
    const addedQuantity = itemInput.quantity - cartItem.data.quantity
    const newStock = product.data.stock - addedQuantity
    if (newStock < 0) {
      throw new InputValidationError('The stock of the product was insufficient.', {
        productId: product.data.id,
        title: product.data.title,
        currentStock: product.data.stock,
        addedQuantity,
      })
    }

    // 書き込み準備ができるまで待機
    await writeReady.wait()

    // カートアイテム更新を実行
    assign(cartItem.data, { quantity: itemInput.quantity })
    transaction.set(cartItem.ref, cartItem.data, { merge: true })
    // 商品の在庫数更新を実行
    assign(product.data, { stock: newStock })
    transaction.update(product.ref, product.data)

    return {
      ...cartItem.data,
      product: product.data,
    }
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
  ): Promise<EditCartItemResponse> {
    // カートアイテムを取得
    const cartItem = await this.m_getCartItemById(transaction, cartItemId)
    // 取得したカートアイテムが自身のものかチェック
    if (cartItem.data.uid !== uid) {
      throw new InputValidationError('You can not access the specified cart item.', {
        cartItemId: cartItem.data.id,
        uid: cartItem.data.uid,
        requestUID: uid,
      })
    }
    // 商品の取得
    const product = await this.m_getProductById(transaction, cartItem.data.productId)
    // 取得した商品の在庫にカートアイテム削除分をプラスする
    const newStock = product.data.stock + cartItem.data.quantity

    // 書き込み準備ができるまで待機
    await writeReady.wait()

    // カートアイテムの削除を実行
    transaction.delete(cartItem.ref)
    // 商品の在庫数更新を実行
    assign(product.data, { stock: newStock })
    transaction.update(product.ref, product.data)

    return {
      ...cartItem.data,
      quantity: 0,
      product: product.data,
    }
  }

  private async m_getProductById(transaction: Transaction, id: string): Promise<{ ref: DocumentReference; data: Product }> {
    const db = admin.firestore()
    const ref = db.collection('products').doc(id)
    const doc = await transaction.get(ref)
    if (!doc.exists) {
      throw new InputValidationError('The specified product was not found.', {
        productId: id,
      })
    }
    return {
      ref,
      data: { id: ref.id, ...doc.data() } as Product,
    }
  }

  private async m_getCartItemById(transaction: Transaction, id: string): Promise<{ ref: DocumentReference; data: CartItem }> {
    const db = admin.firestore()
    const ref = db.collection('cart').doc(id)
    const doc = await transaction.get(ref)
    if (!doc.exists) {
      throw new InputValidationError('The specified cart item was not found.', {
        cartItemId: id,
      })
    }
    return {
      ref: ref,
      data: { id: ref.id, ...doc.data() } as CartItem,
    }
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
