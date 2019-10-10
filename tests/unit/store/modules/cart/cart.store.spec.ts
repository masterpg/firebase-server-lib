import { CartModule, CartState, CheckoutStatus, initStore, store } from '@/store'
import { TestStoreModule } from '../../../../helper/unit'
const cloneDeep = require('lodash/cloneDeep')

initStore()
const cartModule = store.cart as TestStoreModule<CartState, CartModule>

const CART_ITEMS = [
  {
    id: 'cartItem1',
    uid: 'user1',
    productId: 'product1',
    title: 'iPad 4 Mini',
    price: 500.01,
    quantity: 1,
  },
  {
    id: 'cartItem2',
    uid: 'user1',
    productId: 'product2',
    title: 'Fire HD 8 Tablet',
    price: 80.99,
    quantity: 2,
  },
]

beforeEach(async () => {
  cartModule.initState({
    all: cloneDeep(CART_ITEMS),
    checkoutStatus: CheckoutStatus.None,
  })
})

describe('all', () => {
  it('ベーシックケース', () => {
    expect(cartModule.all).toEqual(CART_ITEMS)
  })
})

describe('totalPrice', () => {
  it('ベーシックケース', () => {
    expect(cartModule.totalPrice).toBe(661.99)
  })
})

describe('checkoutStatus', () => {
  it('ベーシックケース', () => {
    expect(cartModule.checkoutStatus).toBe(CheckoutStatus.None)
  })
})

describe('getById()', () => {
  it('ベーシックケース', () => {
    const stateCartItem = cartModule.state.all[0]

    const actual = cartModule.getById(stateCartItem.id)

    expect(actual).toEqual(stateCartItem)
    expect(actual).not.toBe(stateCartItem)
  })

  it('カートに存在しないカートアイテムIDを指定した場合', () => {
    const actual = cartModule.getById('9999')
    expect(actual).toBeUndefined()
  })
})

describe('getByProductId()', () => {
  it('ベーシックケース', () => {
    const stateCartItem = cartModule.state.all[0]

    const actual = cartModule.getByProductId(stateCartItem.productId)

    expect(actual).toEqual(stateCartItem)
    expect(actual).not.toBe(stateCartItem)
  })

  it('カートに存在しない商品IDを指定した場合', () => {
    const actual = cartModule.getByProductId('9999')
    expect(actual).toBeUndefined()
  })
})

describe('set()', () => {
  it('ベーシックケース', () => {
    const cartItem = cartModule.all[0]
    cartItem.title = 'aaa'

    // 一部のプロパティだけを変更
    const actual = cartModule.set({
      id: cartItem.id,
      title: cartItem.title,
    })!

    const stateProduct = cartModule.state.all[0]
    expect(actual).toEqual(cartItem)
    expect(actual).not.toBe(stateProduct)
  })

  it('余分なプロパティを含んだ場合', () => {
    const cartItem = cartModule.all[0]
    ;(cartItem as any).zzz = 'zzz'

    const actual = cartModule.set(cartItem)!

    expect(actual).not.toHaveProperty('zzz')
  })

  it('存在しないカートアイテムIDを指定した場合', () => {
    const cartItem = cartModule.all[0]
    cartItem.id = '9999'

    const actual = cartModule.set(cartItem)

    expect(actual).toBeUndefined()
  })
})

describe('setAll()', () => {
  it('ベーシックケース', () => {
    cartModule.setAll(CART_ITEMS)
    expect(cartModule.state.all).toEqual(CART_ITEMS)
    expect(cartModule.state.all).not.toBe(CART_ITEMS)
  })
})

describe('setCheckoutStatus()', () => {
  it('ベーシックケース', () => {
    cartModule.setCheckoutStatus(CheckoutStatus.Successful)
    expect(cartModule.checkoutStatus).toBe(CheckoutStatus.Successful)
  })
})

describe('add()', () => {
  it('ベーシックケース', () => {
    const cartItem = cartModule.all[0]
    cartItem.id = 'cartItemXXX'
    cartItem.uid = 'user1'
    cartItem.productId = 'product3'
    cartItem.title = 'aaa'
    cartItem.price = 999
    cartItem.quantity = 999

    const actual = cartModule.add(cartItem)

    const stateCartItem = cartModule.state.all[cartModule.state.all.length - 1]
    expect(actual).toEqual(stateCartItem)
    expect(actual).not.toBe(stateCartItem)
  })
})

describe('remove()', () => {
  it('ベーシックケース', () => {
    const cartItem = cartModule.state.all[1]
    const actual = cartModule.remove(cartItem.id)
    expect(actual).toEqual(cartItem)
    expect(cartModule.getById(cartItem.id)).toBeUndefined()
  })
})
