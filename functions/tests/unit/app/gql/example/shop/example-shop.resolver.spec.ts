import * as td from 'testdouble'
import { CartItem, CartItemAddInput, CartItemEditResponse, CartItemUpdateInput, Product } from '../../../../../../src/app/services'
import { GENERAL_USER, GENERAL_USER_HEADER, GENERAL_USER_TOKEN, getGQLErrorStatus, requestGQL } from '../../../../../helpers/app'
import { Test, TestingModule } from '@nestjs/testing'
import ExampleGQLContainerModule from '../../../../../../src/app/gql/example'
import { ExampleShopServiceDI } from '../../../../../../src/app/services/example'
import { OmitEntityTimestamp } from '../../../../../../src/firestore-ex'
import { initApp } from '../../../../../../src/app/base'
import dayjs = require('dayjs')

jest.setTimeout(5000)
initApp()

//========================================================================
//
//  Test data
//
//========================================================================

type RawProduct = OmitEntityTimestamp<Product> & { createdAt: string; updatedAt: string }

const RAW_PRODUCTS: RawProduct[] = [
  {
    id: 'product1',
    title: 'iPad 4 Mini',
    price: 500.01,
    stock: 3,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-02T00:00:00.000Z',
  },
  {
    id: 'product2',
    title: 'Fire HD 8 Tablet',
    price: 80.99,
    stock: 5,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-02T00:00:00.000Z',
  },
  {
    id: 'product3',
    title: 'MediaPad T5 10',
    price: 150.8,
    stock: 10,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-02T00:00:00.000Z',
  },
]

const PRODUCTS: Product[] = RAW_PRODUCTS.map(rawProduct => ({
  ...rawProduct,
  createdAt: dayjs(rawProduct.createdAt),
  updatedAt: dayjs(rawProduct.updatedAt),
}))

type RawCartItem = OmitEntityTimestamp<CartItem> & { createdAt: string; updatedAt: string }

const RAW_CART_ITEMS: RawCartItem[] = [
  {
    id: 'cartItem1',
    uid: GENERAL_USER.uid,
    productId: 'product1',
    title: 'iPad 4 Mini',
    price: 500.01,
    quantity: 1,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-02T00:00:00.000Z',
  },
  {
    id: 'cartItem2',
    uid: GENERAL_USER.uid,
    productId: 'product2',
    title: 'Fire HD 8 Tablet',
    price: 80.99,
    quantity: 2,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-02T00:00:00.000Z',
  },
]

const CART_ITEMS: CartItem[] = RAW_CART_ITEMS.map(rawCartItem => ({
  ...rawCartItem,
  createdAt: dayjs(rawCartItem.createdAt),
  updatedAt: dayjs(rawCartItem.updatedAt),
}))

//========================================================================
//
//  Tests
//
//========================================================================

describe('ExampleShopResolver', () => {
  let app: any
  let shopService: ExampleShopServiceDI.type

  beforeEach(async () => {
    const testingModule: TestingModule = await Test.createTestingModule({
      imports: [ExampleGQLContainerModule],
    }).compile()

    app = testingModule.createNestApplication()
    await app.init()
    shopService = testingModule.get<ExampleShopServiceDI.type>(ExampleShopServiceDI.symbol)
  })

  describe('cartItems', () => {
    const gql = {
      query: `
        query GetCartItems($ids: [ID!]!) {
          cartItems(ids: $ids) { id uid productId title price quantity createdAt updatedAt }
        }
      `,
    }

    it('疎通確認', async () => {
      const ids = CART_ITEMS.map(item => item.id)

      const getCartItems = td.replace(shopService, 'getCartItems')
      td.when(getCartItems(GENERAL_USER_TOKEN, ids)).thenResolve(CART_ITEMS)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { ids },
        },
        { headers: GENERAL_USER_HEADER }
      )

      expect(response.body.data.cartItems).toEqual(RAW_CART_ITEMS)
    })

    it('サインインしていない場合', async () => {
      const ids = CART_ITEMS.map(item => item.id)

      const response = await requestGQL(app, {
        ...gql,
        variables: { ids },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('addCartItems', () => {
    const gql = {
      query: `
        mutation AddCartItems($inputs: [CartItemAddInput!]!) {
          addCartItems(inputs: $inputs) { id uid productId title price quantity product { id title price stock createdAt updatedAt } createdAt updatedAt }
        }
      `,
    }

    it('疎通確認', async () => {
      const inputs: CartItemAddInput[] = [
        {
          productId: PRODUCTS[0].id,
          title: PRODUCTS[0].title,
          price: PRODUCTS[0].price,
          quantity: 1,
        },
      ]

      const addCartItems = td.replace(shopService, 'addCartItems')
      td.when(addCartItems(GENERAL_USER_TOKEN, inputs)).thenResolve([
        {
          ...CART_ITEMS[0],
          product: PRODUCTS[0],
        },
      ] as CartItemEditResponse[])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { inputs },
        },
        { headers: GENERAL_USER_HEADER }
      )

      expect(response.body.data.addCartItems).toEqual([
        {
          ...RAW_CART_ITEMS[0],
          product: RAW_PRODUCTS[0],
        },
      ])
    })

    it('サインインしていない場合', async () => {
      const inputs: CartItemAddInput[] = [
        {
          productId: PRODUCTS[0].id,
          title: PRODUCTS[0].title,
          price: PRODUCTS[0].price,
          quantity: 1,
        },
      ]

      const response = await requestGQL(app, {
        ...gql,
        variables: { inputs },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('updateCartItems', () => {
    const gql = {
      query: `
        mutation UpdateCartItems($inputs: [CartItemUpdateInput!]!) {
          updateCartItems(inputs: $inputs) { id uid productId title price quantity product { id title price stock createdAt updatedAt } createdAt updatedAt }
        }
      `,
    }

    it('疎通確認', async () => {
      const inputs: CartItemUpdateInput[] = [
        {
          id: CART_ITEMS[0].id,
          quantity: CART_ITEMS[0].quantity,
        },
      ]

      const updateCartItems = td.replace(shopService, 'updateCartItems')
      td.when(updateCartItems(GENERAL_USER_TOKEN, inputs)).thenResolve([
        {
          ...CART_ITEMS[0],
          product: PRODUCTS[0],
        },
      ] as CartItemEditResponse[])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { inputs },
        },
        { headers: GENERAL_USER_HEADER }
      )

      expect(response.body.data.updateCartItems).toEqual([
        {
          ...RAW_CART_ITEMS[0],
          product: RAW_PRODUCTS[0],
        },
      ])
    })

    it('サインインしていない場合', async () => {
      const inputs: CartItemUpdateInput[] = [
        {
          id: CART_ITEMS[0].id,
          quantity: CART_ITEMS[0].quantity,
        },
      ]

      const response = await requestGQL(app, {
        ...gql,
        variables: { inputs },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('removeCartItems', () => {
    const gql = {
      query: `
        mutation RemoveCartItems($ids: [ID!]!) {
          removeCartItems(ids: $ids) { id uid productId title price quantity product { id title price stock createdAt updatedAt } createdAt updatedAt }
        }
      `,
    }

    it('疎通確認', async () => {
      const ids = [CART_ITEMS[0].id]

      const removeCartItems = td.replace(shopService, 'removeCartItems')
      td.when(removeCartItems(GENERAL_USER_TOKEN, ids)).thenResolve([
        {
          ...CART_ITEMS[0],
          product: PRODUCTS[0],
        },
      ] as CartItemEditResponse[])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { ids },
        },
        { headers: GENERAL_USER_HEADER }
      )

      expect(response.body.data.removeCartItems).toEqual([
        {
          ...RAW_CART_ITEMS[0],
          product: RAW_PRODUCTS[0],
        },
      ])
    })

    it('サインインしていない場合', async () => {
      const ids = [CART_ITEMS[0].id]

      const response = await requestGQL(app, {
        ...gql,
        variables: { ids },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('checkoutCart', () => {
    const gql = {
      query: `
        mutation CheckoutCart {
          checkoutCart
        }
      `,
    }

    it('疎通確認', async () => {
      const checkoutCart = td.replace(shopService, 'checkoutCart')
      td.when(checkoutCart(GENERAL_USER_TOKEN)).thenResolve(true)

      const response = await requestGQL(
        app,
        {
          ...gql,
        },
        { headers: GENERAL_USER_HEADER }
      )

      expect(response.body.data.checkoutCart).toEqual(true)
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, {
        ...gql,
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })
})
