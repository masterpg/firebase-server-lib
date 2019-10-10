import * as td from 'testdouble'
import { CartItem, CartModule, CartState, CheckoutStatus, ProductModule, ProductState, User, UserModule, UserState, initStore, store } from '@/store'
import { GQLEditCartItemResponse, GQLFacade, GQLProduct, gql, initGQL } from '@/gql'
import { TestLogic, TestStoreModule } from '../../../../helper/unit'
import { initLogic, logic } from '@/logic'
import { ShopLogicImpl } from '@/logic/modules/shop'
const cloneDeep = require('lodash/cloneDeep')

initGQL(td.object<GQLFacade>())
initStore()
initLogic()

const shopLogic = logic.shop as TestLogic<ShopLogicImpl>
const cartModule = store.cart as TestStoreModule<CartState, CartModule>
const productModule = store.product as TestStoreModule<ProductState, ProductModule>
const userModule = store.user as TestStoreModule<UserState, UserModule>

const PRODUCTS: GQLProduct[] = [
  { id: 'product1', title: 'iPad 4 Mini', price: 500.01, stock: 1 },
  { id: 'product2', title: 'Fire HD 8 Tablet', price: 80.99, stock: 5 },
  { id: 'product3', title: 'MediaPad 10', price: 150.8, stock: 10 },
  { id: 'product4', title: 'Surface Go', price: 630, stock: 0 },
]

const CART_ITEMS: CartItem[] = [
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
    quantity: 1,
  },
]

const USER: User = {
  id: 'user1',
  displayName: 'taro',
  email: 'taro@example.com',
  emailVerified: true,
  isSignedIn: true,
  photoURL: '',
}

beforeEach(async () => {
  cartModule.initState({
    all: cloneDeep(CART_ITEMS),
    checkoutStatus: CheckoutStatus.None,
  })
  productModule.initState({
    all: cloneDeep(PRODUCTS),
  })
  userModule.initState(cloneDeep(USER))
})

afterEach(() => {})

describe('products', () => {
  it('ベーシックケース', () => {
    const actual = shopLogic.products
    expect(actual).toEqual(PRODUCTS)
  })
})

describe('cartItems', () => {
  it('ベーシックケース', () => {
    const actual = shopLogic.cartItems
    expect(actual).toEqual(CART_ITEMS)
  })
})

describe('cartTotalPrice', () => {
  it('ベーシックケース', () => {
    const cartItems = cartModule.all
    cartItems[0].price = 100
    cartItems[0].quantity = 1
    cartItems[1].price = 200
    cartItems[1].quantity = 2
    cartModule.state.all = cartItems

    const actual = shopLogic.cartTotalPrice

    expect(actual).toBe(500)
  })
})

describe('checkoutStatus', () => {
  it('ベーシックケース', () => {
    const actual = cartModule.checkoutStatus
    expect(actual).toBe(CheckoutStatus.None)
  })
})

describe('pullProducts()', () => {
  it('ベーシックケース', async () => {
    td.when(gql.products()).thenResolve(PRODUCTS)

    await shopLogic.pullProducts()
    const actual = shopLogic.products

    expect(actual).toEqual(PRODUCTS)
  })

  it('GQLでエラーが発生した場合', async () => {
    td.when(gql.products()).thenThrow(new Error())
    productModule.state.all = []

    await shopLogic.pullProducts()
    const actual = shopLogic.products

    expect(actual.length).toBe(0)
  })
})

describe('pullCartItems()', () => {
  it('ベーシックケース', async () => {
    // ユーザーがサインインしている状態へ変更
    userModule.set({ isSignedIn: true })

    td.when(gql.cartItems()).thenResolve(CART_ITEMS)

    await shopLogic.pullCartItems()
    const actual = shopLogic.cartItems

    expect(actual).toEqual(CART_ITEMS)
  })

  it('GQLでエラーが発生した場合', async () => {
    // ユーザーがサインインしている状態へ変更
    userModule.set({ isSignedIn: true })

    td.when(gql.cartItems()).thenThrow(new Error())
    cartModule.state.all = []

    await shopLogic.pullCartItems()
    const actual = shopLogic.cartItems

    expect(actual.length).toBe(0)
  })

  it('ユーザーがサインインしていない場合', async () => {
    // ユーザーがサインインしていない状態へ変更
    userModule.set({ isSignedIn: false })

    let actual!: Error
    try {
      await shopLogic.pullCartItems()
    } catch (err) {
      actual = err
    }

    expect(actual).toBeInstanceOf(Error)
    expect(actual.message).toBe('Not signed in.')
  })
})

describe('addItemToCart()', () => {
  it('追加しようとする商品がカートに存在しない場合', async () => {
    // ユーザーがサインインしている状態へ変更
    userModule.set({ isSignedIn: true })
    // GQL実行後のレスポンスの設定
    const product3 = PRODUCTS[2]
    const response = {
      id: 'cartItemXXX',
      uid: 'user1',
      productId: product3.id,
      title: product3.title,
      price: product3.price,
      quantity: 1,
      product: {
        id: product3.id,
        stock: 10 - 1,
      },
    } as GQLEditCartItemResponse
    // モック設定
    td.when(gql.addCartItems(td.matchers.anything())).thenResolve([response])
    // 現在の商品の在庫数を設定
    productModule.set({
      id: response.productId,
      stock: 10,
    })

    await shopLogic.addItemToCart(response.productId)

    // GQLが適切な引数でコールされたか検証
    td.verify(
      gql.addCartItems([
        {
          productId: response.productId,
          title: response.title,
          price: response.price,
          quantity: response.quantity,
        },
      ])
    )
    // カートにアイテムが追加されたか検証
    const cartItem = cartModule.getById(response.id)!
    expect(cartItem.quantity).toBe(response.quantity)
    // 商品の在庫数が適切にマイナスされたか検証
    const product = productModule.getById(response.productId)!
    expect(product.stock).toBe(response.product.stock)
    // チェックアウトステータスの検証
    expect(shopLogic.checkoutStatus).toBe(CheckoutStatus.None)
  })

  it('追加しようとする商品がカートに存在する場合', async () => {
    // ユーザーがサインインしている状態へ変更
    userModule.set({ isSignedIn: true })
    // GQL実行後のレスポンスの設定
    const response = {
      ...cartModule.all[0],
      quantity: cartModule.all[0].quantity + 1,
      product: {
        id: cartModule.all[0].productId,
        stock: 10 - 1,
      },
    } as GQLEditCartItemResponse
    // モック設定
    td.when(gql.updateCartItems(td.matchers.anything())).thenResolve([response])
    // 現在の商品の在庫数を設定
    productModule.set({
      id: response.productId,
      stock: 10,
    })

    await shopLogic.addItemToCart(response.productId)

    // GQLが適切な引数でコールされたか検証
    td.verify(
      gql.updateCartItems([
        {
          id: response.id,
          quantity: response.quantity,
        },
      ])
    )
    // カートアイテムの個数が適切にプラスされたか検証
    const cartItem = cartModule.getById(response.id)!
    expect(cartItem.quantity).toBe(response.quantity)
    // 商品の在庫数が適切にマイナスされたか検証
    const product = productModule.getById(response.productId)!
    expect(product.stock).toBe(response.product.stock)
    // チェックアウトステータスの検証
    expect(shopLogic.checkoutStatus).toBe(CheckoutStatus.None)
  })

  it('ユーザーがサインインしていない場合', async () => {
    // ユーザーがサインインしていない状態へ変更
    userModule.set({ isSignedIn: false })
    // チェックアウトステータスに成功を設定
    cartModule.setCheckoutStatus(CheckoutStatus.Successful)

    let actual!: Error
    try {
      await shopLogic.addItemToCart('cartItem1')
    } catch (err) {
      actual = err
    }

    expect(actual).toBeInstanceOf(Error)
    expect(actual.message).toBe('Not signed in.')
  })

  it('GQLでエラーが発生した場合', async () => {
    userModule.set({ isSignedIn: true })
    const prevCartItem = cartModule.all[0]
    const prevProduct = productModule.getById(prevCartItem.productId)!
    td.when(gql.updateCartItems(td.matchers.anything())).thenThrow(new Error())
    cartModule.setCheckoutStatus(CheckoutStatus.Successful)

    await shopLogic.addItemToCart(prevCartItem.productId)

    // カートアイテムの個数に変化がないことを検証
    const cartItem = cartModule.getById(prevCartItem.id)!
    expect(cartItem.quantity).toBe(prevCartItem.quantity)
    // 商品の在庫数がに変化がないことを検証
    const product = productModule.getById(prevProduct.id)!
    expect(product.stock).toBe(prevProduct.stock)
    // チェックアウトステータスに変化がないことを検証
    expect(shopLogic.checkoutStatus).toBe(CheckoutStatus.Successful)
  })
})

describe('removeItemFromCart()', () => {
  it('カートアイテムの数が2個以上の場合', async () => {
    // ユーザーがサインインしている状態へ変更
    userModule.set({ isSignedIn: true })
    // GQL実行後のレスポンスの設定
    const response = {
      ...cartModule.all[0],
      quantity: 1,
      product: {
        id: cartModule.all[0].productId,
        stock: 9 + 1,
      },
    } as GQLEditCartItemResponse
    // モック設定
    td.when(gql.updateCartItems(td.matchers.anything())).thenResolve([response])
    // 現在のカートアイテムの個数を設定
    cartModule.set({
      id: response.id,
      // 現在のカートアイテムの個数を2に設定
      // この場合はGQLの`updateCartItems`がコールされる
      quantity: 2,
    })
    // 現在の商品の在庫数を設定
    productModule.set({
      id: response.productId,
      stock: 9,
    })

    await shopLogic.removeItemFromCart(response.productId)

    // GQLが適切な引数でコールされたか検証
    td.verify(
      gql.updateCartItems([
        {
          id: response.id,
          quantity: response.quantity,
        },
      ])
    )
    // カートアイテムの個数が適切にマイナスされたか検証
    const cartItem = cartModule.getById(response.id)!
    expect(cartItem.quantity).toBe(response.quantity)
    // 商品の在庫数が適切にプラスされたか検証
    const product = productModule.getById(response.productId)!
    expect(product.stock).toBe(response.product.stock)
    // チェックアウトステータスの検証
    expect(shopLogic.checkoutStatus).toBe(CheckoutStatus.None)
  })

  it('カートアイテムの数が1個の場合', async () => {
    // ユーザーがサインインしている状態へ変更
    userModule.set({ isSignedIn: true })
    // GQL実行後のレスポンスの設定
    const response = {
      ...cartModule.all[0],
      quantity: 0,
      product: {
        id: cartModule.all[0].productId,
        stock: 9 + 1,
      },
    } as GQLEditCartItemResponse
    // モック設定
    td.when(gql.removeCartItems(td.matchers.anything())).thenResolve([response])
    // 現在のカートアイテムの個数を設定
    cartModule.set({
      id: response.id,
      quantity: 1,
    })
    // 現在の商品の在庫数を設定
    productModule.set({
      id: response.productId,
      stock: 9,
    })

    await shopLogic.removeItemFromCart(response.productId)

    // GQLが適切な引数でコールされたか検証
    td.verify(gql.removeCartItems([response.id]))
    // カートアイテムが削除されたか検証
    expect(cartModule.getById(response.id)).toBeUndefined()
    // 商品の在庫数が適切にプラスされたか検証
    const product = productModule.getById(response.productId)!
    expect(product.stock).toBe(response.product.stock)
    // チェックアウトステータスの検証
    expect(shopLogic.checkoutStatus).toBe(CheckoutStatus.None)
  })

  it('ユーザーがサインインしていない場合', async () => {
    // ユーザーがサインインしていない状態へ変更
    userModule.set({ isSignedIn: false })
    // チェックアウトステータスに成功を設定
    cartModule.setCheckoutStatus(CheckoutStatus.Successful)

    let actual!: Error
    try {
      await shopLogic.removeItemFromCart('cartItem1')
    } catch (err) {
      actual = err
    }

    expect(actual).toBeInstanceOf(Error)
    expect(actual.message).toBe('Not signed in.')
  })

  it('GQLでエラーが発生した場合', async () => {
    userModule.set({ isSignedIn: true })
    const prevCartItem = cartModule.all[0]
    const prevProduct = productModule.getById(prevCartItem.productId)!
    td.when(gql.updateCartItems(td.matchers.anything())).thenThrow(new Error())
    cartModule.setCheckoutStatus(CheckoutStatus.Successful)

    await shopLogic.addItemToCart(prevCartItem.productId)

    // カートアイテムの個数に変化がないことを検証
    const cartItem = cartModule.getById(prevCartItem.id)!
    expect(cartItem.quantity).toBe(prevCartItem.quantity)
    // 商品の在庫数がに変化がないことを検証
    const product = productModule.getById(prevProduct.id)!
    expect(product.stock).toBe(prevProduct.stock)
    // チェックアウトステータスに変化がないことを検証
    expect(shopLogic.checkoutStatus).toBe(CheckoutStatus.Successful)
  })
})

describe('checkout()', () => {
  it('ベーシックケース', async () => {
    userModule.set({ isSignedIn: true })

    await shopLogic.checkout()

    td.verify(gql.checkoutCart())
    expect(shopLogic.cartItems).toEqual([])
    expect(shopLogic.checkoutStatus).toBe(CheckoutStatus.Successful)
  })

  it('GQLでエラーが発生した場合', async () => {
    td.when(gql.checkoutCart()).thenThrow(new Error())

    await shopLogic.checkout()

    expect(shopLogic.cartItems).toEqual(CART_ITEMS)
    expect(shopLogic.checkoutStatus).toBe(CheckoutStatus.Failed)
  })
})
