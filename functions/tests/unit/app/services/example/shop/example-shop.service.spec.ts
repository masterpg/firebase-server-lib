import {
  CartItem,
  CartItemAddInput,
  CartItemUpdateInput,
  DevUtilsServiceDI,
  DevUtilsServiceModule,
  ExampleShopServiceDI,
  ExampleShopServiceModule,
  Product,
} from '../../../../../../src/app/services'
import { InputValidationError, ValidationErrors, initApp } from '../../../../../../src/app/base'
import { GeneralUser } from '../../../../../helpers/app'
import { OmitEntityTimestamp } from '../../../../../../src/firestore-ex'
import { StoreServiceDI } from '../../../../../../src/app/services/base/store'
import { Test } from '@nestjs/testing'
import dayjs = require('dayjs')

jest.setTimeout(25000)
initApp()

// TODO
//  Firestoreのエミュレータでトランザクション失敗を検証するテストを行うと、
//  後続の単体テストが失敗してしまう。この対応としてやむなくエミュレータ
//  ではなくサーバーのFirestoreに接続するようにしている。
process.env.FIRESTORE_EMULATOR_HOST = ''

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

beforeAll(async () => {
  const testingModule = await Test.createTestingModule({
    imports: [DevUtilsServiceModule],
  }).compile()

  const devUtilsService = testingModule.get<DevUtilsServiceDI.type>(DevUtilsServiceDI.symbol)
  await devUtilsService.setTestFirebaseUsers(GeneralUser())
})

describe('ExampleShop', () => {
  let devUtilsService: DevUtilsServiceDI.type
  let storeService: StoreServiceDI.type
  let shopService: ExampleShopServiceDI.type

  beforeEach(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [ExampleShopServiceModule, DevUtilsServiceModule],
    }).compile()

    devUtilsService = testingModule.get<DevUtilsServiceDI.type>(DevUtilsServiceDI.symbol)
    storeService = testingModule.get<StoreServiceDI.type>(StoreServiceDI.symbol)
    shopService = testingModule.get<ExampleShopServiceDI.type>(ExampleShopServiceDI.symbol)
  })

  describe('getProducts', () => {
    it('商品IDを指定しない場合', async () => {
      await devUtilsService.putTestStoreData([{ collectionName: 'products', collectionRecords: RawProducts() }])

      const actual = await shopService.getProducts()

      expect(actual).toMatchObject(Products())
    })

    it('商品IDを1つ指定した場合', async () => {
      await devUtilsService.putTestStoreData([{ collectionName: 'products', collectionRecords: RawProducts() }])
      const product = Products()[0]

      const actual = await shopService.getProducts([product.id])

      expect(actual[0]).toMatchObject(product)
    })

    it('商品IDの配列を指定した場合', async () => {
      await devUtilsService.putTestStoreData([{ collectionName: 'products', collectionRecords: RawProducts() }])
      const ids = [Products()[0].id, Products()[1].id]

      const actual = await shopService.getProducts(ids)

      expect(actual).toMatchObject([Products()[0], Products()[1]])
    })

    it('存在しない商品IDを指定した場合', async () => {
      await devUtilsService.putTestStoreData([{ collectionName: 'products', collectionRecords: RawProducts() }])
      const actual = await shopService.getProducts(['productXXX'])

      expect(actual.length).toBe(0)
    })

    it('一部存在しない商品IDを指定した場合', async () => {
      await devUtilsService.putTestStoreData([{ collectionName: 'products', collectionRecords: RawProducts() }])
      const ids = ['productXXX', Products()[0].id]

      const actual = await shopService.getProducts(ids)

      expect(actual).toMatchObject([Products()[0]])
    })

    it('全て存在しない商品IDを指定した場合', async () => {
      await devUtilsService.putTestStoreData([{ collectionName: 'products', collectionRecords: RawProducts() }])
      const ids = ['productXXX', 'productYYY']

      const actual = await shopService.getProducts(ids)

      expect(actual.length).toBe(0)
    })
  })

  describe('getCartItems', () => {
    it('カートアイテムIDを指定しない場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RawProducts() },
        { collectionName: 'cart', collectionRecords: RawCartItems() },
      ])

      const actual = await shopService.getCartItems(GeneralUser())

      expect(actual).toEqual(CartItems())
    })

    it('カートアイテムIDを1つ指定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RawProducts() },
        { collectionName: 'cart', collectionRecords: RawCartItems() },
      ])
      const cartItem = CartItems()[0]

      const actual = await shopService.getCartItems(GeneralUser(), [cartItem.id])

      expect(actual).toMatchObject([cartItem])
    })

    it('カートアイテムIDを複数指定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RawProducts() },
        { collectionName: 'cart', collectionRecords: RawCartItems() },
      ])
      const ids = [CartItems()[0].id, CartItems()[1].id]

      const actual = await shopService.getCartItems(GeneralUser(), ids)

      expect(actual).toMatchObject([CartItems()[0], CartItems()[1]])
    })

    it('一部存在しない商品IDを指定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RawProducts() },
        { collectionName: 'cart', collectionRecords: RawCartItems() },
      ])
      const ids = ['cartItemXXX', CartItems()[0].id]

      const actual = await shopService.getCartItems(GeneralUser(), ids)

      expect(actual).toMatchObject([CartItems()[0]])
    })

    it('全て存在しない商品IDを指定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RawProducts() },
        { collectionName: 'cart', collectionRecords: RawCartItems() },
      ])
      const ids = ['cartItemXXX', 'cartItemYYY']

      const actual = await shopService.getCartItems(GeneralUser(), ids)

      expect(actual.length).toBe(0)
    })

    it('存在しないカートアイテムIDを指定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RawProducts() },
        { collectionName: 'cart', collectionRecords: RawCartItems() },
      ])
      const actual = await shopService.getCartItems(GeneralUser(), ['cartItemXXX'])

      expect(actual.length).toBe(0)
    })
  })

  describe('addCartItems', () => {
    function AddInputs(): CartItemAddInput[] {
      return CartItems().map(item => {
        delete item.id
        delete item.uid
        delete item.createdAt
        delete item.updatedAt
        return item
      })
    }

    it('ベーシックケース', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RawProducts() },
        { collectionName: 'cart', collectionRecords: [] },
      ])
      const inputs = AddInputs()

      const actual = await shopService.addCartItems(GeneralUser(), inputs)

      expect(actual.length).toBe(inputs.length)
      for (let i = 0; i < actual.length; i++) {
        const actualItem = actual[i]
        const addedCartItem = (await storeService.cartDao.fetch(actualItem.id))!
        const updatedProduct = (await storeService.productDao.fetch(actualItem.productId))!
        const beforeProduct = Products().find(product => product.id === actualItem.productId)!
        // 戻り値の検証
        expect(actualItem).toEqual({ ...addedCartItem, product: updatedProduct })
        expect(actualItem.product.stock).toEqual(beforeProduct.stock - actualItem.quantity)
        // 商品の在庫が更新されているか検証
        expect(updatedProduct).toEqual(actualItem.product)
        expect(updatedProduct.createdAt).toEqual(beforeProduct.createdAt)
        expect(updatedProduct.updatedAt.isAfter(beforeProduct.updatedAt)).toBeTruthy()
      }
    })

    it('存在しない商品を指定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: [] },
        { collectionName: 'cart', collectionRecords: [] },
      ])
      const input = AddInputs()[0]
      input.productId = 'abcdefg'

      let actual!: InputValidationError
      try {
        await shopService.addCartItems(GeneralUser(), [input])
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe('The specified product could not be found.')
    })

    it('既に存在するカートアイテムを追加しようとした場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RawProducts() },
        { collectionName: 'cart', collectionRecords: RawCartItems() },
      ])
      const input = AddInputs()[0]

      let actual!: InputValidationError
      try {
        await shopService.addCartItems(GeneralUser(), [input])
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe('The specified cart item already exists.')
    })

    it('在庫数を上回る数をカートアイテムに設定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RawProducts() },
        { collectionName: 'cart', collectionRecords: [] },
      ])
      const input = AddInputs()[0]
      input.quantity = 4 // 在庫数を上回る数を設定

      let actual!: InputValidationError
      try {
        await shopService.addCartItems(GeneralUser(), [input])
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe('The product is out of stock.')
    })

    it('カートアイテムの数量にマイナス値を設定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RawProducts() },
        { collectionName: 'cart', collectionRecords: [] },
      ])
      const input = AddInputs()[0]
      input.quantity = -1 // マイナス値を設定

      let actual!: ValidationErrors
      try {
        await shopService.addCartItems(GeneralUser(), [input])
      } catch (err) {
        actual = err
      }

      expect(actual.detail[0].property).toBe('quantity')
      expect(actual.detail[0].constraints).toHaveProperty('isPositive')
    })

    it('カートアイテムの商品を重複指定していた場合', async () => {
      const inputs = [AddInputs()[0], AddInputs()[0]]

      let actual!: InputValidationError
      try {
        await shopService.addCartItems(GeneralUser(), inputs)
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe('The specified product is a duplicate.')
    })

    it('アトミックオペレーションの検証', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RawProducts() },
        { collectionName: 'cart', collectionRecords: [] },
      ])
      const inputs = AddInputs()
      inputs[1].productId = 'abcdefg' // 2件目に存在しない商品IDを指定

      let actual!: Error
      try {
        await shopService.addCartItems(GeneralUser(), inputs)
      } catch (err) {
        actual = err
      }

      expect(actual).toBeInstanceOf(Error)

      // カートアイテムが追加されていないことを検証
      const cartItems = await shopService.getCartItems(GeneralUser())
      expect(cartItems.length).toBe(0)
      // 商品の在庫数が更新されていないことを検証
      const products = await shopService.getProducts()
      expect(products).toMatchObject(Products())
    })
  })

  describe('updateCartItems', () => {
    it('ベーシックケース', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RawProducts() },
        { collectionName: 'cart', collectionRecords: RawCartItems() },
      ])
      const inputs: CartItemUpdateInput[] = CartItems().map(item => {
        return { id: item.id, quantity: item.quantity + 1 }
      })

      const actual = await shopService.updateCartItems(GeneralUser(), inputs)

      expect(actual.length).toBe(inputs.length)
      for (let i = 0; i < actual.length; i++) {
        const actualItem = actual[i]
        const input = inputs[i]
        const updatedCartItem = (await storeService.cartDao.fetch(actualItem.id))!
        const updatedProduct = (await storeService.productDao.fetch(actualItem.productId))!
        const beforeCartItem = CartItems().find(item => item.id === actualItem.id)!
        const beforeProduct = Products().find(product => product.id === actualItem.productId)!
        // 戻り値の検証
        expect(actualItem).toEqual({ ...updatedCartItem, product: updatedProduct })
        expect(actualItem.quantity).toEqual(input.quantity)
        expect(actualItem.createdAt).toEqual(beforeCartItem.createdAt)
        expect(actualItem.updatedAt.isAfter(beforeCartItem.updatedAt)).toBeTruthy()
        // 商品の在庫が更新されているか検証
        expect(updatedProduct.stock).toBe(beforeProduct.stock - 1)
        expect(updatedProduct.createdAt).toEqual(beforeProduct.createdAt)
        expect(updatedProduct.updatedAt.isAfter(beforeProduct.updatedAt)).toBeTruthy()
      }
    })

    it('自ユーザー以外のカートアイテムを変更しようとした場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RawProducts() },
        {
          collectionName: 'cart',
          // 自ユーザー以外のカートアイテムをテストデータ投入
          collectionRecords: RawCartItems().map(item => {
            return { ...item, uid: 'test.general.xxx' }
          }),
        },
      ])
      const updateItems = CartItems().map(item => {
        return { id: item.id, quantity: item.quantity + 1 }
      })

      let actual!: InputValidationError
      try {
        await shopService.updateCartItems(GeneralUser(), updateItems)
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe('You cannot access the specified cart item.')
    })

    it('在庫数を上回る数をカートアイテムに設定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RawProducts() },
        { collectionName: 'cart', collectionRecords: RawCartItems() },
      ])
      const updateItem = CartItems()[0]
      const input = { id: updateItem.id, quantity: updateItem.quantity }
      const product = Products().find(product => product.id === updateItem.productId)!
      input.quantity += product.stock + 1 // 在庫数を上回る数を設定

      let actual!: InputValidationError
      try {
        await shopService.updateCartItems(GeneralUser(), [input])
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe('The product is out of stock.')
    })

    it('カートアイテムの数量にマイナス値を設定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RawProducts() },
        { collectionName: 'cart', collectionRecords: RawCartItems() },
      ])
      const updateItem = CartItems()[0]
      const input = { id: updateItem.id, quantity: updateItem.quantity }
      input.quantity = -1 // マイナス値を設定

      let actual!: ValidationErrors
      try {
        await shopService.updateCartItems(GeneralUser(), [input])
      } catch (err) {
        actual = err
      }

      expect(actual.detail[0].property).toBe('quantity')
      expect(actual.detail[0].constraints).toHaveProperty('isPositive')
    })

    it('更新対象のカートアイテムを重複指定していた場合', async () => {
      const inputs = [
        { id: CartItems()[0].id, quantity: CartItems()[0].quantity },
        { id: CartItems()[0].id, quantity: CartItems()[0].quantity },
      ]

      let actual!: InputValidationError
      try {
        await shopService.updateCartItems(GeneralUser(), inputs)
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe('The specified cart item is a duplicate.')
    })

    it('アトミックオペレーションの検証', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RawProducts() },
        { collectionName: 'cart', collectionRecords: RawCartItems() },
      ])
      const inputs = [
        { id: CartItems()[0].id, quantity: CartItems()[0].quantity },
        { id: CartItems()[1].id, quantity: CartItems()[1].quantity },
      ]
      inputs[0].quantity = 2
      inputs[1].quantity = 9999999999 // 2件目に在庫数を上回る数を設定

      let actual!: Error
      try {
        await shopService.updateCartItems(GeneralUser(), inputs)
      } catch (err) {
        actual = err
      }

      expect(actual).toBeInstanceOf(Error)

      // カートアイテムが更新されていないことを検証
      const cartItems = await shopService.getCartItems(GeneralUser())
      expect(cartItems).toMatchObject(CartItems())
      // 商品の在庫数が更新されていないことを検証
      const products = await shopService.getProducts()
      expect(products).toMatchObject(Products())
    })
  })

  describe('removeCartItems', () => {
    it('ベーシックケース', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RawProducts() },
        { collectionName: 'cart', collectionRecords: RawCartItems() },
      ])
      const removeIds = CartItems().map(item => item.id)

      const actual = await shopService.removeCartItems(GeneralUser(), removeIds)

      expect(actual.length).toBe(removeIds.length)
      for (let i = 0; i < actual.length; i++) {
        const actualItem = actual[i]
        const updatedProduct = (await storeService.productDao.fetch(actualItem.productId))!
        const beforeCartItem = CartItems().find(item => item.id === actualItem.id)!
        const beforeProduct = Products().find(product => product.id === actualItem.productId)!
        // 戻り値の検証
        expect(actualItem).toEqual({ ...beforeCartItem, product: updatedProduct })
        expect(actualItem.quantity).toEqual(beforeCartItem.quantity)
        expect(actualItem.createdAt).toEqual(beforeCartItem.createdAt)
        expect(actualItem.updatedAt).toEqual(beforeCartItem.updatedAt)
        // カートアイテムが削除されているか検証
        const removedItem = await storeService.cartDao.fetch(actualItem.id)
        expect(removedItem).toBeUndefined()
        // 商品の在庫が更新されているか検証
        expect(updatedProduct.stock).toBe(beforeProduct.stock + beforeCartItem.quantity)
        expect(updatedProduct.createdAt).toEqual(beforeProduct.createdAt)
        expect(updatedProduct.updatedAt.isAfter(beforeProduct.updatedAt)).toBeTruthy()
      }
    })

    it('自ユーザー以外のカートアイテムを削除しようとした場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RawProducts() },
        {
          collectionName: 'cart',
          // 自ユーザー以外のカートアイテムをテストデータ投入
          collectionRecords: RawCartItems().map(item => {
            return { ...item, uid: 'test.general.xxx' }
          }),
        },
      ])
      const removeIds = CartItems().map(item => item.id)

      let actual!: InputValidationError
      try {
        await shopService.removeCartItems(GeneralUser(), removeIds)
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe('You cannot access the specified cart item.')
    })

    it('削除対象のカートアイテムを重複指定していた場合', async () => {
      const removeIds = [CartItems()[0].id, CartItems()[0].id]

      let actual!: InputValidationError
      try {
        await shopService.removeCartItems(GeneralUser(), removeIds)
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe('The specified cart item is a duplicate.')
    })

    it('アトミックオペレーションの検証', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RawProducts() },
        { collectionName: 'cart', collectionRecords: RawCartItems() },
      ])
      const removeIds = CartItems().map(item => item.id)
      removeIds[1] = 'cartItemXXX' // 2件目に存在しないカートアイテムIDを設定

      let actual!: Error
      try {
        await shopService.removeCartItems(GeneralUser(), removeIds)
      } catch (err) {
        actual = err
      }

      expect(actual).toBeInstanceOf(Error)

      // カートアイテムが削除されていないことを検証
      const cartItems = await shopService.getCartItems(GeneralUser())
      expect(cartItems).toEqual(CartItems())
      // 商品の在庫数が更新されていないことを検証
      const products = await shopService.getProducts()
      expect(products).toEqual(Products())
    })
  })

  describe('checkoutCart', () => {
    it('ベーシックケース', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RawProducts() },
        { collectionName: 'cart', collectionRecords: RawCartItems() },
      ])

      const actual = await shopService.checkoutCart(GeneralUser())

      expect(actual).toBeTruthy()
      // カートアイテムが削除されてることを検証
      const cartItems = await shopService.getCartItems(GeneralUser())
      expect(cartItems.length).toBe(0)
    })
  })
})
