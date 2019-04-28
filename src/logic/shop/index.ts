import Vue from 'vue'
import {Component} from 'vue-property-decorator'
import {CartItem, CheckoutStatus, Product, ShopLogic} from '@/logic/types'
import {api} from '@/api'
import {store} from '@/store'
import {NoCache} from '@/base/component'
import {utils} from '@/base/utils'

@Component
export class ShopLogicImpl extends Vue implements ShopLogic {
  //----------------------------------------------------------------------
  //
  //  Properties
  //
  //----------------------------------------------------------------------

  @NoCache
  get products(): Product[] {
    return utils.cloneDeep(store.product.products)
  }

  @NoCache
  get cartItems(): CartItem[] {
    return utils.cloneDeep(store.cart.items)
  }

  get cartTotalPrice(): number {
    return store.cart.totalPrice
  }

  get checkoutStatus(): CheckoutStatus {
    return store.cart.checkoutStatus
  }

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  async pullProducts(): Promise<void> {
    const products = await api.shop.getProducts()
    store.product.setProducts(products)
  }

  addProductToCart(productId: string): void {
    store.cart.setCheckoutStatus(CheckoutStatus.None)
    const product = this.m_getProductById(productId)
    if (product.inventory > 0) {
      const cartItem = store.cart.items.find(item => item.id === product.id)
      if (!cartItem) {
        store.cart.addProductToCart(product)
      } else {
        store.cart.incrementItemQuantity(productId)
      }
      store.product.decrementInventory(productId)
    }
  }

  async checkout(): Promise<void> {
    store.cart.setCheckoutStatus(CheckoutStatus.None)
    try {
      await api.shop.buyProducts(this.cartItems)
      store.cart.setItems([]) // カートを空にする
      store.cart.setCheckoutStatus(CheckoutStatus.Successful)
    } catch (err) {
      store.cart.setCheckoutStatus(CheckoutStatus.Failed)
    }
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  private m_getProductById(productId: string): Product {
    const result = store.product.getProductById(productId)
    if (!result) {
      throw new Error(`A Product that matches the specified productId "${productId}" was not found.`)
    }
    return result
  }
}
