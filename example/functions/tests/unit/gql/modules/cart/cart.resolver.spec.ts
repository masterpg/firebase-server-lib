import { Test, TestingModule } from '@nestjs/testing'
import { AppModule } from '../../../../../src/app.module'
import { initFirebaseApp } from 'web-server-lib'
import { verifyNotSignInCase } from '../../../../tools/gql.helpers'

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
      return verifyNotSignInCase(app, gql)
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
      return verifyNotSignInCase(app, gql)
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
      return verifyNotSignInCase(app, gql)
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
      return verifyNotSignInCase(app, gql)
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
      return verifyNotSignInCase(app, gql)
    })
  })
})
