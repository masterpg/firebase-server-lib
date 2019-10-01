import { GQLAddCartItemInput, GQLCartItem, GQLEditCartItemResponse, GQLProduct, gql, initGQL } from '@/gql'
import { clearAuthUser, putTestData, setAuthUser, testGQL } from '../../helper/comm'
const cloneDeep = require('lodash/cloneDeep')

jest.setTimeout(25000)
initGQL(testGQL)

const GENERAL_USER = { uid: 'taro.yamada' }

const PRODUCTS: GQLProduct[] = [
  { id: 'product1', title: 'iPad 4 Mini', price: 500.01, stock: 3 },
  { id: 'product2', title: 'Fire HD 8 Tablet', price: 80.99, stock: 5 },
  { id: 'product3', title: 'MediaPad T5 10', price: 150.8, stock: 10 },
]

const CART_ITEMS: GQLCartItem[] = [
  {
    id: 'cartItem1',
    uid: GENERAL_USER.uid,
    productId: 'product1',
    title: 'iPad 4 Mini',
    price: 500.01,
    quantity: 1,
  },
  {
    id: 'cartItem2',
    uid: GENERAL_USER.uid,
    productId: 'product2',
    title: 'Fire HD 8 Tablet',
    price: 80.99,
    quantity: 2,
  },
]

function getGQLErrorResponse(error: any): { statusCode: number; error: string; message: string } {
  return error.graphQLErrors[0].extensions.exception.response
}

beforeEach(async () => {
  clearAuthUser()
})

describe('product', () => {
  it('疎通確認', async () => {
    await putTestData([{ collectionName: 'products', collectionRecords: PRODUCTS }])
    const product = PRODUCTS[0]

    const actual = await gql.product(product.id)

    expect(actual).toMatchObject(product)
  })

  it('存在しない商品IDを指定した場合', async () => {
    await putTestData([{ collectionName: 'products', collectionRecords: PRODUCTS }])
    const actual = await gql.product('productXXX')

    expect(actual).toBeUndefined()
  })
})

describe('products', () => {
  it('疎通確認', async () => {
    await putTestData([{ collectionName: 'products', collectionRecords: PRODUCTS }])
    const ids = [PRODUCTS[0].id, PRODUCTS[1].id]

    const actual = await gql.products(ids)

    expect(actual).toMatchObject([PRODUCTS[0], PRODUCTS[1]])
  })

  it('存在しない商品IDを指定した場合', async () => {
    await putTestData([{ collectionName: 'products', collectionRecords: PRODUCTS }])
    const ids = ['productXXX', 'productYYY']

    const actual = await gql.products(ids)

    expect(actual.length).toBe(0)
  })
})

describe('cartItem', () => {
  it('疎通確認', async () => {
    setAuthUser(GENERAL_USER)
    await putTestData([{ collectionName: 'products', collectionRecords: PRODUCTS }, { collectionName: 'cart', collectionRecords: CART_ITEMS }])
    const cartItem = CART_ITEMS[0]

    const actual = await gql.cartItem(cartItem.id)

    expect(actual).toMatchObject(cartItem)
  })

  it('存在しないカートアイテムIDを指定した場合', async () => {
    setAuthUser(GENERAL_USER)
    await putTestData([{ collectionName: 'products', collectionRecords: PRODUCTS }, { collectionName: 'cart', collectionRecords: CART_ITEMS }])
    const actual = await gql.cartItem('cartItemXXX')

    expect(actual).toBeUndefined()
  })

  it('サインインしていない場合', async () => {
    const cartItem = CART_ITEMS[0]

    let actual!: Error
    try {
      await gql.cartItem(cartItem.id)
    } catch (err) {
      actual = err
    }

    expect(getGQLErrorResponse(actual).statusCode).toBe(403)
  })
})

describe('cartItems', () => {
  it('疎通確認', async () => {
    setAuthUser(GENERAL_USER)
    await putTestData([{ collectionName: 'products', collectionRecords: PRODUCTS }, { collectionName: 'cart', collectionRecords: CART_ITEMS }])
    const ids = [CART_ITEMS[0].id, CART_ITEMS[1].id]

    const actual = await gql.cartItems(ids)

    expect(actual).toMatchObject([CART_ITEMS[0], CART_ITEMS[1]])
  })

  it('存在しない商品IDを指定した場合', async () => {
    setAuthUser(GENERAL_USER)
    await putTestData([{ collectionName: 'products', collectionRecords: PRODUCTS }, { collectionName: 'cart', collectionRecords: CART_ITEMS }])
    const ids = ['cartItemXXX', 'cartItemYYY']

    const actual = await gql.cartItems(ids)

    expect(actual.length).toBe(0)
  })

  it('サインインしていない場合', async () => {
    const ids = [CART_ITEMS[0].id, CART_ITEMS[1].id]

    let actual!: Error
    try {
      await gql.cartItems(ids)
    } catch (err) {
      actual = err
    }

    expect(getGQLErrorResponse(actual).statusCode).toBe(403)
  })
})

describe('addCartItems', () => {
  const ADD_CART_ITEMS = cloneDeep(CART_ITEMS).map(item => {
    delete item.id
    delete item.uid
    return item
  }) as GQLAddCartItemInput[]

  it('疎通確認', async () => {
    setAuthUser(GENERAL_USER)
    await putTestData([{ collectionName: 'products', collectionRecords: PRODUCTS }, { collectionName: 'cart', collectionRecords: [] }])
    const addItems = cloneDeep(ADD_CART_ITEMS) as GQLAddCartItemInput[]
    const expectedItems = addItems.map(addItem => {
      const product = PRODUCTS.find(product => product.id === addItem.productId)!
      return {
        ...addItem,
        product: {
          id: product.id,
          stock: product.stock - addItem.quantity,
        },
      }
    }) as GQLEditCartItemResponse[]

    const actual = await gql.addCartItems(addItems)

    expect(actual.length).toBe(addItems.length)
    for (let i = 0; i < actual.length; i++) {
      const actualItem = actual[i]
      expect(actualItem.id).toEqual(expect.anything())
      expect(actualItem.uid).toBe(GENERAL_USER.uid)
      expect(actualItem).toMatchObject(expectedItems[i])
    }
  })

  it('サインインしていない場合', async () => {
    const addItems = cloneDeep(ADD_CART_ITEMS) as GQLAddCartItemInput[]

    let actual!: Error
    try {
      await gql.addCartItems(addItems)
    } catch (err) {
      actual = err
    }

    expect(getGQLErrorResponse(actual).statusCode).toBe(403)
  })
})

describe('updateCartItems', () => {
  it('疎通確認', async () => {
    setAuthUser(GENERAL_USER)
    await putTestData([{ collectionName: 'products', collectionRecords: PRODUCTS }, { collectionName: 'cart', collectionRecords: CART_ITEMS }])
    const updateItems = CART_ITEMS.map(item => {
      return { ...item, quantity: item.quantity + 1 }
    })
    const expectedItems = updateItems.map(item => {
      const product = PRODUCTS.find(product => product.id === item.productId)!
      return { ...item, product: { id: product.id, stock: product.stock - 1 } }
    })

    const actual = await gql.updateCartItems(updateItems)

    expect(actual.length).toBe(updateItems.length)
    for (let i = 0; i < actual.length; i++) {
      expect(actual[i]).toMatchObject(expectedItems[i])
    }
  })

  it('サインインしていない場合', async () => {
    const updateItems = cloneDeep(CART_ITEMS) as GQLCartItem[]

    let actual!: Error
    try {
      await gql.updateCartItems(updateItems)
    } catch (err) {
      actual = err
    }

    expect(getGQLErrorResponse(actual).statusCode).toBe(403)
  })
})

describe('removeCartItems', () => {
  it('疎通確認', async () => {
    setAuthUser(GENERAL_USER)
    await putTestData([{ collectionName: 'products', collectionRecords: PRODUCTS }, { collectionName: 'cart', collectionRecords: CART_ITEMS }])
    const removeIds = CART_ITEMS.map(item => item.id) as string[]
    const expectedItems = removeIds.map(id => {
      const cartItem = CART_ITEMS.find(item => item.id === id)!
      const product = PRODUCTS.find(product => product.id === cartItem.productId)!
      return {
        ...cartItem,
        quantity: 0,
        product: {
          id: product.id,
          stock: product.stock + cartItem.quantity,
        },
      }
    })

    const actual = await gql.removeCartItems(removeIds)

    expect(actual.length).toBe(removeIds.length)
    for (let i = 0; i < actual.length; i++) {
      expect(actual[i]).toMatchObject(expectedItems[i])
    }
  })

  it('サインインしていない場合', async () => {
    const removeIds = CART_ITEMS.map(item => item.id)

    let actual!: Error
    try {
      await gql.removeCartItems(removeIds)
    } catch (err) {
      actual = err
    }

    expect(getGQLErrorResponse(actual).statusCode).toBe(403)
  })
})

describe('checkout', () => {
  it('ベーシックケース', async () => {
    setAuthUser(GENERAL_USER)
    await putTestData([{ collectionName: 'products', collectionRecords: PRODUCTS }, { collectionName: 'cart', collectionRecords: CART_ITEMS }])

    const actual = await gql.checkoutCart()

    expect(actual).toBeTruthy()
    // カートアイテムが削除されてることを検証
    const cartItems = await gql.cartItems()
    expect(cartItems.length).toBe(0)
  })

  it('サインインしていない場合', async () => {
    const removeIds = CART_ITEMS.map(item => item.id)

    let actual!: Error
    try {
      await gql.removeCartItems(removeIds)
    } catch (err) {
      actual = err
    }

    expect(getGQLErrorResponse(actual).statusCode).toBe(403)
  })
})
