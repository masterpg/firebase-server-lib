import * as td from 'testdouble'
import { CartItem, CartItemAddInput, CartItemEditResponse, CartItemUpdateInput, Product } from '../../../../../../src/app/services'
import { GeneralUser, GeneralUserHeader, GeneralUserToken, getGQLErrorStatus, requestGQL } from '../../../../../helpers/app'
import { Test, TestingModule } from '@nestjs/testing'
import ExampleGQLContainerModule from '../../../../../../src/app/gql/example'
import { ExampleShopServiceDI } from '../../../../../../src/app/services'
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

function RawProducts(): RawProduct[] {
  return [
    {
      id: 'product1',
      title: 'iPad 4 Mini',
      price: 500.01,
      stock: 3,
      version: 1,
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-02T00:00:00.000Z',
    },
    {
      id: 'product2',
      title: 'Fire HD 8 Tablet',
      price: 80.99,
      stock: 5,
      version: 1,
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-02T00:00:00.000Z',
    },
    {
      id: 'product3',
      title: 'MediaPad T5 10',
      price: 150.8,
      stock: 10,
      version: 1,
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-02T00:00:00.000Z',
    },
  ]
}

function Products(): Product[] {
  return RawProducts().map(rawProduct => ({
    ...rawProduct,
    createdAt: dayjs(rawProduct.createdAt),
    updatedAt: dayjs(rawProduct.updatedAt),
  }))
}

type RawCartItem = OmitEntityTimestamp<CartItem> & { createdAt: string; updatedAt: string }

function RawCartItems(): RawCartItem[] {
  return [
    {
      id: 'cartItem1',
      uid: GeneralUser().uid,
      productId: 'product1',
      title: 'iPad 4 Mini',
      price: 500.01,
      quantity: 1,
      version: 1,
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-02T00:00:00.000Z',
    },
    {
      id: 'cartItem2',
      uid: GeneralUser().uid,
      productId: 'product2',
      title: 'Fire HD 8 Tablet',
      price: 80.99,
      quantity: 2,
      version: 1,
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-02T00:00:00.000Z',
    },
  ]
}

function CartItems(): CartItem[] {
  return RawCartItems().map(rawCartItem => ({
    ...rawCartItem,
    createdAt: dayjs(rawCartItem.createdAt),
    updatedAt: dayjs(rawCartItem.updatedAt),
  }))
}

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
          cartItems(ids: $ids) { id uid productId title price quantity version createdAt updatedAt }
        }
      `,
    }

    it('疎通確認', async () => {
      const ids = CartItems().map(item => item.id)

      const getCartItems = td.replace(shopService, 'getCartItems')
      td.when(getCartItems(GeneralUserToken(), ids)).thenResolve(CartItems())

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { ids },
        },
        { headers: GeneralUserHeader() }
      )

      expect(response.body.data.cartItems).toEqual(RawCartItems())
    })

    it('サインインしていない場合', async () => {
      const ids = CartItems().map(item => item.id)

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
          addCartItems(inputs: $inputs) { id uid productId title price quantity product { id title price stock version createdAt updatedAt } version createdAt updatedAt }
        }
      `,
    }

    it('疎通確認', async () => {
      const inputs: CartItemAddInput[] = [
        {
          productId: Products()[0].id,
          title: Products()[0].title,
          price: Products()[0].price,
          quantity: 1,
        },
      ]

      const addCartItems = td.replace(shopService, 'addCartItems')
      td.when(addCartItems(GeneralUserToken(), inputs)).thenResolve([
        {
          ...CartItems()[0],
          product: Products()[0],
        },
      ] as CartItemEditResponse[])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { inputs },
        },
        { headers: GeneralUserHeader() }
      )

      expect(response.body.data.addCartItems).toEqual([
        {
          ...RawCartItems()[0],
          product: RawProducts()[0],
        },
      ])
    })

    it('サインインしていない場合', async () => {
      const inputs: CartItemAddInput[] = [
        {
          productId: Products()[0].id,
          title: Products()[0].title,
          price: Products()[0].price,
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
          updateCartItems(inputs: $inputs) { id uid productId title price quantity product { id title price stock version createdAt updatedAt } version createdAt updatedAt }
        }
      `,
    }

    it('疎通確認', async () => {
      const inputs: CartItemUpdateInput[] = [
        {
          id: CartItems()[0].id,
          quantity: CartItems()[0].quantity,
        },
      ]

      const updateCartItems = td.replace(shopService, 'updateCartItems')
      td.when(updateCartItems(GeneralUserToken(), inputs)).thenResolve([
        {
          ...CartItems()[0],
          product: Products()[0],
        },
      ] as CartItemEditResponse[])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { inputs },
        },
        { headers: GeneralUserHeader() }
      )

      expect(response.body.data.updateCartItems).toEqual([
        {
          ...RawCartItems()[0],
          product: RawProducts()[0],
        },
      ])
    })

    it('サインインしていない場合', async () => {
      const inputs: CartItemUpdateInput[] = [
        {
          id: CartItems()[0].id,
          quantity: CartItems()[0].quantity,
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
          removeCartItems(ids: $ids) { id uid productId title price quantity product { id title price stock version createdAt updatedAt } version createdAt updatedAt }
        }
      `,
    }

    it('疎通確認', async () => {
      const ids = [CartItems()[0].id]

      const removeCartItems = td.replace(shopService, 'removeCartItems')
      td.when(removeCartItems(GeneralUserToken(), ids)).thenResolve([
        {
          ...CartItems()[0],
          product: Products()[0],
        },
      ] as CartItemEditResponse[])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { ids },
        },
        { headers: GeneralUserHeader() }
      )

      expect(response.body.data.removeCartItems).toEqual([
        {
          ...RawCartItems()[0],
          product: RawProducts()[0],
        },
      ])
    })

    it('サインインしていない場合', async () => {
      const ids = [CartItems()[0].id]

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
      td.when(checkoutCart(GeneralUserToken())).thenResolve(true)

      const response = await requestGQL(
        app,
        {
          ...gql,
        },
        { headers: GeneralUserHeader() }
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
