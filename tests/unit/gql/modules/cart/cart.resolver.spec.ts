import { Test, TestingModule } from '@nestjs/testing'
import { AppModule } from '../../../../../src/app.module'
import { initFirebaseApp } from '../../../../../src/base/firebase'
import { verifyGQLNotSignInCase } from '../../../../helper/gql'

jest.setTimeout(25000)
initFirebaseApp()

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
    it('サインインしていない場合', async () => {
      return verifyGQLNotSignInCase(app, {
        query: `
          query GetCartItems {
            cartItems { __typename }
          }
        `,
      })
    })
  })

  describe('updateCartItems', () => {
    it('サインインしていない場合', async () => {
      return verifyGQLNotSignInCase(app, {
        query: `
          mutation UpdateCartItems {
            updateCartItems(inputs: [
              { id: "cartItem1" quantity: 1 }
            ]) { __typename }
          }
        `,
      })
    })
  })

  describe('addCartItems', () => {
    it('サインインしていない場合', async () => {
      return verifyGQLNotSignInCase(app, {
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
      })
    })
  })

  describe('removeCartItems', () => {
    it('サインインしていない場合', async () => {
      return verifyGQLNotSignInCase(app, {
        query: `
          mutation RemoveCartItems {
            removeCartItems(ids: [
              "cartItem1"
            ]) { __typename }
          }
        `,
      })
    })
  })

  describe('checkoutCart', () => {
    it('サインインしていない場合', async () => {
      return verifyGQLNotSignInCase(app, {
        query: `
          mutation CheckoutCart {
            checkoutCart
          }
        `,
      })
    })
  })
})
