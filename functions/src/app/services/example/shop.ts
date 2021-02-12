import { AppError, WriteReadyObserver, validate } from '../../base'
import { CartItem, CartItemAddInput, CartItemEditResponse, CartItemUpdateInput, Product } from '../base/types'
import { Inject, Module } from '@nestjs/common'
import { StoreServiceDI, StoreServiceModule } from '../base/store'
import { findDuplicateItems, findDuplicateValues } from 'web-base-lib'
import { Transaction } from '../../../firestore-ex'

//========================================================================
//
//  Implementation
//
//========================================================================

class ExampleShopService {
  constructor(@Inject(StoreServiceDI.symbol) protected readonly storeService: StoreServiceDI.type) {}

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  async getProducts(ids?: string[]): Promise<Product[]> {
    if (ids && ids.length) {
      const dict: { [id: string]: Product } = {}
      await Promise.all(
        ids.map(async id => {
          const product = await this.storeService.productDao.fetch(id)
          if (product) dict[product.id] = product
        })
      )
      return ids.reduce((result, id) => {
        const product = dict[id]
        product && result.push(product)
        return result
      }, [] as Product[])
    } else {
      return await this.storeService.productDao.fetchAll()
    }
  }

  async getCartItems(user: { uid: string }, ids?: string[]): Promise<CartItem[]> {
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

  async addCartItems(user: { uid: string }, inputs: CartItemAddInput[]): Promise<CartItemEditResponse[]> {
    await validate(CartItemAddInput, inputs)
    this.m_validateAddInputDuplication(inputs)

    let addedCartItemIds!: string[]

    await this.storeService.runTransaction(async tx => {
      const writeReady = new WriteReadyObserver(inputs.length)
      const promises = inputs.map(input => this.m_addCartItem(user.uid, input, tx, writeReady))
      addedCartItemIds = await Promise.all(promises)
    })

    return await this.m_getCartItemEditResponses(addedCartItemIds)
  }

  async updateCartItems(user: { uid: string }, inputs: CartItemUpdateInput[]): Promise<CartItemEditResponse[]> {
    await validate(CartItemUpdateInput, inputs)
    this.m_validateUpdateInputDuplication(inputs)

    let updatedCartItemIds!: string[]

    await this.storeService.runTransaction(async tx => {
      const writeReady = new WriteReadyObserver(inputs.length)
      const promises = inputs.map(input => this.m_updateCartItem(user.uid, input, tx, writeReady))
      updatedCartItemIds = await Promise.all(promises)
    })

    return await this.m_getCartItemEditResponses(updatedCartItemIds)
  }

  async removeCartItems(user: { uid: string }, ids: string[]): Promise<CartItemEditResponse[]> {
    this.m_validateRemoveInputDuplication(ids)

    let removedCartItems!: CartItem[]

    await this.storeService.runTransaction(async tx => {
      const writeReady = new WriteReadyObserver(ids.length)
      const promises = ids.map(id => this.m_removeCartItem(user.uid, id, tx, writeReady))
      removedCartItems = await Promise.all(promises)
    })

    return await Promise.all(
      removedCartItems.map(async cartItem => {
        const product = (await this.storeService.productDao.fetch(cartItem.productId))!
        return { ...cartItem, product }
      })
    )
  }

  async checkoutCart(user: { uid: string }): Promise<boolean> {
    const cartItems = await this.storeService.cartDao.where('uid', '==', user.uid).fetch()
    await this.storeService.runBatch(async batch => {
      for (const cartItem of cartItems) {
        await this.storeService.cartDao.delete(cartItem.id, batch)
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
   * @param tx
   * @param writeReady
   */
  private async m_addCartItem(uid: string, itemInput: CartItemAddInput, tx: Transaction, writeReady: WriteReadyObserver): Promise<string> {
    // 商品を取得
    const product = await this.m_getProductById(itemInput.productId, tx)

    // 追加しようとするカートアイテムが存在しないことをチェック
    const cartItems = await this.storeService.cartDao.where('uid', '==', uid).where('productId', '==', itemInput.productId).fetch(tx)
    if (cartItems.length > 0) {
      const cartItem = cartItems[0]
      throw new AppError('The specified cart item already exists.', {
        cartItemId: cartItem.id,
        uid: cartItem.uid,
        productId: cartItem.productId,
        title: cartItem.title,
      })
    }

    // 商品の在庫数を再計算
    const newStock = product.stock - itemInput.quantity
    if (newStock < 0) {
      throw new AppError('The product is out of stock.', {
        productId: product.id,
        title: product.title,
        currentStock: product.stock,
        addedQuantity: itemInput.quantity,
      })
    }

    // 書き込み準備ができるまで待機
    await writeReady.wait()

    // 新規カートアイテム追加を実行
    const cartItem = {
      id: '',
      uid,
      version: 1,
      ...itemInput,
    }
    cartItem.id = await this.storeService.cartDao.add(cartItem, tx)

    // 商品の在庫数更新を実行
    product.stock = newStock
    product.version += 1
    await this.storeService.productDao.update(product, tx)

    return cartItem.id
  }

  /**
   * カートのアイテムを更新します。
   * @param uid
   * @param input
   * @param tx
   * @param writeReady
   */
  private async m_updateCartItem(uid: string, input: CartItemUpdateInput, tx: Transaction, writeReady: WriteReadyObserver): Promise<string> {
    // カートアイテムを取得
    const cartItem = await this.m_getCartItemById(uid, input.id, tx)

    // 商品を取得
    const product = await this.m_getProductById(cartItem.productId, tx)

    // 今回カートアイテムに追加された商品の個数を算出
    const addedQuantity = cartItem.quantity - input.quantity

    // 今回カートアイテムに追加された商品の個数をもとに商品の在庫数を算出
    const newStock = product.stock + addedQuantity
    if (newStock < 0) {
      throw new AppError('The product is out of stock.', {
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
    await this.storeService.cartDao.update(
      {
        id: cartItem.id,
        quantity: cartItem.quantity,
        version: cartItem.version + 1,
      },
      tx
    )

    // 商品の在庫数更新を実行
    product.stock = newStock
    await this.storeService.productDao.update(
      {
        id: product.id,
        stock: product.stock,
        version: product.version + 1,
      },
      tx
    )

    return cartItem.id
  }

  /**
   * カートからアイテムを削除します。
   * @param uid
   * @param cartItemId
   * @param tx
   * @param writeReady
   */
  private async m_removeCartItem(uid: string, cartItemId: string, tx: Transaction, writeReady: WriteReadyObserver): Promise<CartItem> {
    // カートアイテムを取得
    const cartItem = await this.m_getCartItemById(uid, cartItemId, tx)

    // 商品を取得
    const product = await this.m_getProductById(cartItem.productId, tx)
    // 取得した商品の在庫にカートアイテム削除分をプラスする
    const newStock = product.stock + cartItem.quantity

    // 書き込み準備ができるまで待機
    await writeReady.wait()

    // カートアイテムの削除を実行
    await this.storeService.cartDao.delete(cartItem.id, tx)

    // 商品の在庫数更新を実行
    product.stock = newStock
    product.version += 1
    await this.storeService.productDao.update(product, tx)

    return cartItem
  }

  private async m_getProductById(id: string, tx: Transaction): Promise<Product> {
    const product = await this.storeService.productDao.fetch(id, tx)
    if (!product) {
      throw new AppError('The specified product could not be found.', {
        productId: id,
      })
    }
    return product
  }

  private async m_getCartItemById(uid: string, id: string, tx: Transaction): Promise<CartItem> {
    const cartItem = await this.storeService.cartDao.fetch(id, tx)
    if (!cartItem) {
      throw new AppError('The specified cart item could not be found.', {
        cartItemId: id,
      })
    }
    // 取得したカートアイテムが自身のものかチェック
    if (cartItem.uid !== uid) {
      throw new AppError('You cannot access the specified cart item.', {
        cartItemId: cartItem.id,
        uid: cartItem.uid,
        requestUID: uid,
      })
    }
    return cartItem
  }

  async m_getCartItemEditResponses(cartItemIds: string[]): Promise<CartItemEditResponse[]> {
    return await Promise.all(
      cartItemIds.map(async id => {
        const cartItem = (await this.storeService.cartDao.fetch(id))!
        const product = (await this.storeService.productDao.fetch(cartItem.productId))!
        return { ...cartItem, product }
      })
    )
  }

  private m_validateAddInputDuplication(inputs: CartItemAddInput[]): void {
    const duplicates = findDuplicateItems(inputs, 'productId')
    if (duplicates.length > 0) {
      throw new AppError(`The specified product is a duplicate.`, {
        cartItemId: duplicates[0],
      })
    }
  }

  private m_validateUpdateInputDuplication(inputs: CartItemUpdateInput[]): void {
    const duplicates = findDuplicateItems(inputs, 'id')
    if (duplicates.length > 0) {
      throw new AppError(`The specified cart item is a duplicate.`, {
        cartItemId: duplicates[0],
      })
    }
  }

  private m_validateRemoveInputDuplication(cartItemIds: string[]): void {
    const duplicates = findDuplicateValues(cartItemIds)
    if (duplicates.length > 0) {
      throw new AppError(`The specified cart item is a duplicate.`, {
        cartItemId: duplicates[0],
      })
    }
  }
}

namespace ExampleShopServiceDI {
  export const symbol = Symbol(ExampleShopService.name)
  export const provider = {
    provide: symbol,
    useClass: ExampleShopService,
  }
  export type type = ExampleShopService
}

@Module({
  providers: [ExampleShopServiceDI.provider],
  exports: [ExampleShopServiceDI.provider],
  imports: [StoreServiceModule],
})
class ExampleShopServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { ExampleShopServiceDI, ExampleShopServiceModule }
