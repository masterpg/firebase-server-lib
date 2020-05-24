import { AppStoreServiceDI, AppStoreServiceModule, CartItem, Product } from './store'
import { CartItemEditResponse, CartItemAddInput as _AddCartItemInput, CartItemUpdateInput as _UpdateCartItemInput } from '../gql.schema'
import { Inject, Injectable, Module } from '@nestjs/common'
import { InputValidationError, WriteReadyObserver, validate } from '../../lib/base'
import { findDuplicateItems, findDuplicateValues } from 'web-base-lib'
import { IsPositive } from 'class-validator'

//========================================================================
//
//  Interfaces
//
//========================================================================

class CartItemAddInput implements _AddCartItemInput {
  productId!: string
  title!: string
  @IsPositive() price!: number
  @IsPositive() quantity!: number
}

class CartItemUpdateInput implements _UpdateCartItemInput {
  id!: string
  @IsPositive() quantity!: number
}

//========================================================================
//
//  Implementation
//
//========================================================================

@Injectable()
class CartService {
  constructor(@Inject(AppStoreServiceDI.symbol) protected readonly storeService: AppStoreServiceDI.type) {}

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  async findList(user: { uid: string }, ids?: string[]): Promise<CartItem[]> {
    if (ids && ids.length) {
      const dict: { [id: string]: CartItem } = {}
      await Promise.all(
        ids.map(async id => {
          const cartItem = await this.storeService.cartDao.fetch(id)
          if (cartItem && cartItem.uid === user.uid) dict[cartItem.id] = cartItem
        })
      )
      return ids.reduce((result, id) => {
        const cartItem = dict[id]
        cartItem && result.push(cartItem)
        return result
      }, [] as CartItem[])
    } else {
      return await this.storeService.cartDao.where('uid', '==', user.uid).fetch()
    }
  }

  async addList(user: { uid: string }, inputs: CartItemAddInput[]): Promise<CartItemEditResponse[]> {
    await validate(CartItemAddInput, inputs)
    this.m_validateAddInputDuplication(inputs)

    let result!: CartItemEditResponse[]

    await this.storeService.runTransaction(async () => {
      const writeReady = new WriteReadyObserver(inputs.length)
      const promises = inputs.map(input => this.m_addCartItem(user.uid, input, writeReady))
      result = await Promise.all(promises)
    })

    return result
  }

  async updateList(user: { uid: string }, inputs: CartItemUpdateInput[]): Promise<CartItemEditResponse[]> {
    await validate(CartItemUpdateInput, inputs)
    this.m_validateUpdateInputDuplication(inputs)

    let result!: CartItemEditResponse[]

    await this.storeService.runTransaction(async () => {
      const writeReady = new WriteReadyObserver(inputs.length)
      const promises = inputs.map(input => this.m_updateCartItem(user.uid, input, writeReady))
      result = await Promise.all(promises)
    })

    return result
  }

  async removeList(user: { uid: string }, ids: string[]): Promise<CartItemEditResponse[]> {
    this.m_validateRemoveInputDuplication(ids)

    let result!: CartItemEditResponse[]

    await this.storeService.runTransaction(async () => {
      const writeReady = new WriteReadyObserver(ids.length)
      const promises = ids.map(id => this.m_removeCartItem(user.uid, id, writeReady))
      result = await Promise.all(promises)
    })

    return result
  }

  async checkoutCart(user: { uid: string }): Promise<boolean> {
    const cartItems = await this.storeService.cartDao.where('uid', '==', user.uid).fetch()
    await this.storeService.runBatch(async () => {
      for (const cartItem of cartItems) {
        await this.storeService.cartDao.delete(cartItem.id)
      }
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
   * @param uid
   * @param itemInput
   * @param writeReady
   */
  private async m_addCartItem(uid: string, itemInput: CartItemAddInput, writeReady: WriteReadyObserver): Promise<CartItemEditResponse> {
    // 商品を取得
    const product = await this.m_getProductById(itemInput.productId)

    // 追加しようとするカートアイテムが存在しないことをチェック
    const cartItems = await this.storeService.cartDao.where('uid', '==', uid).where('productId', '==', itemInput.productId).fetch()
    if (cartItems.length > 0) {
      const cartItem = cartItems[0]
      throw new InputValidationError('The specified cart item already exists.', {
        cartItemId: cartItem.id,
        uid: cartItem.uid,
        productId: cartItem.productId,
        title: cartItem.title,
      })
    }

    // 商品の在庫数を再計算
    const newStock = product.stock - itemInput.quantity
    if (newStock < 0) {
      throw new InputValidationError('The product is out of stock.', {
        productId: product.id,
        title: product.title,
        currentStock: product.stock,
        addedQuantity: itemInput.quantity,
      })
    }

    // 書き込み準備ができるまで待機
    await writeReady.wait()

    // 新規カートアイテム追加を実行
    const cartItem = { id: '', uid, ...itemInput }
    cartItem.id = await this.storeService.cartDao.add(cartItem)

    // 商品の在庫数更新を実行
    product.stock = newStock
    await this.storeService.productDao.update(product)

    return { ...cartItem, product }
  }

  /**
   * カートのアイテムを更新します。
   * @param uid
   * @param input
   * @param writeReady
   */
  private async m_updateCartItem(uid: string, input: CartItemUpdateInput, writeReady: WriteReadyObserver): Promise<CartItemEditResponse> {
    // カートアイテムを取得
    const cartItem = await this.m_getCartItemById(uid, input.id)

    // 商品を取得
    const product = await this.m_getProductById(cartItem.productId)

    // 今回カートアイテムに追加された商品の個数を算出
    const addedQuantity = cartItem.quantity - input.quantity

    // 今回カートアイテムに追加された商品の個数をもとに商品の在庫数を算出
    const newStock = product.stock + addedQuantity
    if (newStock < 0) {
      throw new InputValidationError('The product is out of stock.', {
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
    await this.storeService.cartDao.update({
      id: cartItem.id,
      quantity: cartItem.quantity,
    })

    // 商品の在庫数更新を実行
    product.stock = newStock
    await this.storeService.productDao.update({
      id: product.id,
      stock: product.stock,
    })

    return { ...cartItem, product }
  }

  /**
   * カートからアイテムを削除します。
   * @param uid
   * @param cartItemId
   * @param writeReady
   */
  private async m_removeCartItem(uid: string, cartItemId: string, writeReady: WriteReadyObserver): Promise<CartItemEditResponse> {
    // カートアイテムを取得
    const cartItem = await this.m_getCartItemById(uid, cartItemId)

    // 商品を取得
    const product = await this.m_getProductById(cartItem.productId)
    // 取得した商品の在庫にカートアイテム削除分をプラスする
    const newStock = product.stock + cartItem.quantity

    // 書き込み準備ができるまで待機
    await writeReady.wait()

    // カートアイテムの削除を実行
    await this.storeService.cartDao.delete(cartItem.id)

    // 商品の在庫数更新を実行
    product.stock = newStock
    await this.storeService.productDao.update(product)

    return { ...cartItem, quantity: 0, product }
  }

  private async m_getProductById(id: string): Promise<Product> {
    const product = await this.storeService.productDao.fetch(id)
    if (!product) {
      throw new InputValidationError('The specified product could not be found.', {
        productId: id,
      })
    }
    return product
  }

  private async m_getCartItemById(uid: string, id: string): Promise<CartItem> {
    const cartItem = await this.storeService.cartDao.fetch(id)
    if (!cartItem) {
      throw new InputValidationError('The specified cart item could not be found.', {
        cartItemId: id,
      })
    }
    // 取得したカートアイテムが自身のものかチェック
    if (cartItem.uid !== uid) {
      throw new InputValidationError('You cannot access the specified cart item.', {
        cartItemId: cartItem.id,
        uid: cartItem.uid,
        requestUID: uid,
      })
    }
    return cartItem
  }

  private m_validateAddInputDuplication(inputs: CartItemAddInput[]): void {
    const duplicates = findDuplicateItems(inputs, 'productId')
    if (duplicates.length > 0) {
      throw new InputValidationError(`The specified product is a duplicate.`, {
        cartItemId: duplicates[0],
      })
    }
  }

  private m_validateUpdateInputDuplication(inputs: CartItemUpdateInput[]): void {
    const duplicates = findDuplicateItems(inputs, 'id')
    if (duplicates.length > 0) {
      throw new InputValidationError(`The specified cart item is a duplicate.`, {
        cartItemId: duplicates[0],
      })
    }
  }

  private m_validateRemoveInputDuplication(cartItemIds: string[]): void {
    const duplicates = findDuplicateValues(cartItemIds)
    if (duplicates.length > 0) {
      throw new InputValidationError(`The specified cart item is a duplicate.`, {
        cartItemId: duplicates[0],
      })
    }
  }
}

namespace CartServiceDI {
  export const symbol = Symbol(CartService.name)
  export const provider = {
    provide: symbol,
    useClass: CartService,
  }
  export type type = CartService
}

@Module({
  providers: [CartServiceDI.provider],
  exports: [CartServiceDI.provider],
  imports: [AppStoreServiceModule],
})
class CartServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { CartServiceDI, CartServiceModule, CartItem, CartItemEditResponse, CartItemUpdateInput, CartItemAddInput }
