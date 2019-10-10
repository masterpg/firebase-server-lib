import { CartItem, CartModule, CartState, CheckoutStatus, Product, StatePartial } from '@/store/types'
import { BaseModule } from '@/store/base'
import { Component } from 'vue-property-decorator'
import { NoCache } from '@/base/decorators'
const assign = require('lodash/assign')

@Component
export class CartModuleImpl extends BaseModule<CartState> implements CartModule {
  //----------------------------------------------------------------------
  //
  //  Constructors
  //
  //----------------------------------------------------------------------

  constructor() {
    super()
    this.initState({
      all: [],
      checkoutStatus: CheckoutStatus.None,
    })
  }

  //----------------------------------------------------------------------
  //
  //  Properties
  //
  //----------------------------------------------------------------------

  @NoCache
  get all(): CartItem[] {
    return this.state.all.map(value => {
      return this.clone(value)
    })
  }

  get totalPrice(): number {
    return this.state.all.reduce((total, item) => {
      return total + item.price * item.quantity
    }, 0)
  }

  get checkoutStatus(): CheckoutStatus {
    return this.state.checkoutStatus
  }

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  clone(value: CartItem): CartItem {
    return {
      id: value.id,
      uid: value.uid,
      productId: value.productId,
      title: value.title,
      price: value.price,
      quantity: value.quantity,
    }
  }

  getById(id: string): CartItem | undefined {
    const stateItem = this.m_getById(id)
    return stateItem ? this.clone(stateItem) : undefined
  }

  getByProductId(productId: string): CartItem | undefined {
    const stateItem = this.state.all.find(item => item.productId === productId)
    return stateItem ? this.clone(stateItem) : undefined
  }

  set(item: StatePartial<Omit<CartItem, 'uid' | 'productId'>>): CartItem | undefined {
    const stateItem = this.m_getById(item.id)
    if (stateItem) {
      const tmp = this.clone(stateItem)
      assign(tmp, item)
      assign(stateItem, tmp)
    }
    return stateItem ? this.clone(stateItem) : undefined
  }

  setAll(items: CartItem[]): void {
    this.state.all = items.map(value => {
      return this.clone(value)
    })
  }

  setCheckoutStatus(status: CheckoutStatus): void {
    this.state.checkoutStatus = status
  }

  add(item: CartItem): CartItem {
    const stateItem = this.clone(item)
    this.state.all.push(stateItem)
    return this.clone(stateItem)
  }

  remove(id: string): CartItem | undefined {
    let foundIndex = -1
    this.all.some((value, index) => {
      if (value.id === id) {
        foundIndex = index
        return true
      }
      return false
    })
    if (foundIndex >= 0) {
      const result = this.all[foundIndex]
      this.state.all.splice(foundIndex, 1)
      return result
    }
    return undefined
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  private m_getById(cartId: string): CartItem | undefined {
    return this.state.all.find(item => item.id === cartId)
  }
}
