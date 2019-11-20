import { Test, TestingModule } from '@nestjs/testing'
import { requestGQL, verifyNotSignInGQLResponse } from '../../../../../helpers/example/gql'
import { AppModule } from '../../../../../../src/example/app.module'
import { initFirebaseApp } from '../../../../../../src/lib'

jest.setTimeout(25000)
initFirebaseApp()

const authorizationHeader = {
  Authorization: `Bearer {"uid": "yamada.one"}`,
}

describe('CartResolver', () => {
  let app: any

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()
  })

  describe('cartItems', () => {
    const gql = {
      query: `
        query GetCartItems {
          cartItems { __typename }
        }
      `,
    }

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      await verifyNotSignInGQLResponse(response)
    })
  })

  describe('updateCartItems', () => {
    const gql = {
      query: `
        mutation UpdateCartItems {
          updateCartItems(inputs: [
            { id: "cartItem1" quantity: 1 }
          ]) { __typename }
        }
      `,
    }

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      await verifyNotSignInGQLResponse(response)
    })
  })

  describe('addCartItems', () => {
    const gql = {
      query: `
        mutation AddCartItems {
          addCartItems(inputs: [
            {
              productId: "product1"
              title: "iPad 4 Mini"
              price: 500.01
              quantity: 1
            }
          ]) { __typename }
        }
      `,
    }

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      await verifyNotSignInGQLResponse(response)
    })
  })

  describe('removeCartItems', () => {
    const gql = {
      query: `
        mutation RemoveCartItems {
          removeCartItems(ids: [
            "cartItem1"
          ]) { __typename }
        }
      `,
    }

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      await verifyNotSignInGQLResponse(response)
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

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      await verifyNotSignInGQLResponse(response)
    })
  })
})
