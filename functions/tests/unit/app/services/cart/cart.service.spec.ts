import {
  CartItem,
  CartItemAddInput,
  CartItemUpdateInput,
  CartServiceDI,
  DevUtilsServiceDI,
  DevUtilsServiceModule,
  Product,
  ProductServiceDI,
} from '../../../../../src/app/services'
import { InputValidationError, ValidationErrors, initApp } from '../../../../../src/app/base'
import DevUtilsGQLModule from '../../../../../src/app/gql/dev'
import { GENERAL_USER } from '../../../../helpers/app'
import GQLContainerModule from '../../../../../src/app/gql/gql.module'
import { OmitEntityTimestamp } from '../../../../../src/firestore-ex'
import { StoreServiceDI } from '../../../../../src/app/services/base/store'
import { Test } from '@nestjs/testing'
import { cloneDeep } from 'lodash'
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

beforeAll(async () => {
  const testingModule = await Test.createTestingModule({
    imports: [DevUtilsServiceModule],
  }).compile()

  const devUtilsService = testingModule.get<DevUtilsServiceDI.type>(DevUtilsServiceDI.symbol)
  await devUtilsService.setTestFirebaseUsers(GENERAL_USER)
})

describe('CartService', () => {
  let devUtilsService: DevUtilsServiceDI.type
  let storeService: StoreServiceDI.type
  let cartService: CartServiceDI.type
  let productService: ProductServiceDI.type

  beforeEach(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [GQLContainerModule, DevUtilsGQLModule],
    }).compile()

    devUtilsService = testingModule.get<DevUtilsServiceDI.type>(DevUtilsServiceDI.symbol)
    storeService = testingModule.get<StoreServiceDI.type>(StoreServiceDI.symbol)
    cartService = testingModule.get<CartServiceDI.type>(CartServiceDI.symbol)
    productService = testingModule.get<ProductServiceDI.type>(ProductServiceDI.symbol)
  })

  describe('findList', () => {
    it('カートアイテムIDを指定しない場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RAW_PRODUCTS },
        { collectionName: 'cart', collectionRecords: RAW_CART_ITEMS },
      ])

      const actual = await cartService.findList(GENERAL_USER)

      expect(actual).toEqual(CART_ITEMS)
    })

    it('カートアイテムIDを1つ指定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RAW_PRODUCTS },
        { collectionName: 'cart', collectionRecords: RAW_CART_ITEMS },
      ])
      const cartItem = CART_ITEMS[0]

      const actual = await cartService.findList(GENERAL_USER, [cartItem.id])

      expect(actual).toMatchObject([cartItem])
    })

    it('カートアイテムIDを複数指定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RAW_PRODUCTS },
        { collectionName: 'cart', collectionRecords: RAW_CART_ITEMS },
      ])
      const ids = [CART_ITEMS[0].id, CART_ITEMS[1].id]

      const actual = await cartService.findList(GENERAL_USER, ids)

      expect(actual).toMatchObject([CART_ITEMS[0], CART_ITEMS[1]])
    })

    it('一部存在しない商品IDを指定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RAW_PRODUCTS },
        { collectionName: 'cart', collectionRecords: RAW_CART_ITEMS },
      ])
      const ids = ['cartItemXXX', CART_ITEMS[0].id]

      const actual = await cartService.findList(GENERAL_USER, ids)

      expect(actual).toMatchObject([CART_ITEMS[0]])
    })

    it('全て存在しない商品IDを指定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RAW_PRODUCTS },
        { collectionName: 'cart', collectionRecords: RAW_CART_ITEMS },
      ])
      const ids = ['cartItemXXX', 'cartItemYYY']

      const actual = await cartService.findList(GENERAL_USER, ids)

      expect(actual.length).toBe(0)
    })

    it('存在しないカートアイテムIDを指定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RAW_PRODUCTS },
        { collectionName: 'cart', collectionRecords: RAW_CART_ITEMS },
      ])
      const actual = await cartService.findList(GENERAL_USER, ['cartItemXXX'])

      expect(actual.length).toBe(0)
    })
  })

  describe('addList', () => {
    const ADD_INPUTS = cloneDeep(CART_ITEMS).map(item => {
      delete item.id
      delete item.uid
      delete item.createdAt
      delete item.updatedAt
      return item
    }) as CartItemAddInput[]

    it('ベーシックケース', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RAW_PRODUCTS },
        { collectionName: 'cart', collectionRecords: [] },
      ])
      const inputs = cloneDeep(ADD_INPUTS)

      const actual = await cartService.addList(GENERAL_USER, inputs)

      expect(actual.length).toBe(inputs.length)
      for (let i = 0; i < actual.length; i++) {
        const actualItem = actual[i]
        const addedCartItem = (await storeService.cartDao.fetch(actualItem.id))!
        const updatedProduct = (await storeService.productDao.fetch(actualItem.productId))!
        const beforeProduct = PRODUCTS.find(product => product.id === actualItem.productId)!
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
      const input = cloneDeep(ADD_INPUTS[0])
      input.productId = 'abcdefg'

      let actual!: InputValidationError
      try {
        await cartService.addList(GENERAL_USER, [input])
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe('The specified product could not be found.')
    })

    it('既に存在するカートアイテムを追加しようとした場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RAW_PRODUCTS },
        { collectionName: 'cart', collectionRecords: RAW_CART_ITEMS },
      ])
      const input = cloneDeep(ADD_INPUTS[0])

      let actual!: InputValidationError
      try {
        await cartService.addList(GENERAL_USER, [input])
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe('The specified cart item already exists.')
    })

    it('在庫数を上回る数をカートアイテムに設定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RAW_PRODUCTS },
        { collectionName: 'cart', collectionRecords: [] },
      ])
      const input = cloneDeep(ADD_INPUTS[0])
      input.quantity = 4 // 在庫数を上回る数を設定

      let actual!: InputValidationError
      try {
        await cartService.addList(GENERAL_USER, [input])
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe('The product is out of stock.')
    })

    it('カートアイテムの数量にマイナス値を設定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RAW_PRODUCTS },
        { collectionName: 'cart', collectionRecords: [] },
      ])
      const input = cloneDeep(ADD_INPUTS[0])
      input.quantity = -1 // マイナス値を設定

      let actual!: ValidationErrors
      try {
        await cartService.addList(GENERAL_USER, [input])
      } catch (err) {
        actual = err
      }

      expect(actual.detail[0].property).toBe('quantity')
      expect(actual.detail[0].constraints).toHaveProperty('isPositive')
    })

    it('カートアイテムの商品を重複指定していた場合', async () => {
      const inputs = [cloneDeep(ADD_INPUTS[0]), cloneDeep(ADD_INPUTS[0])]

      let actual!: InputValidationError
      try {
        await cartService.addList(GENERAL_USER, inputs)
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe('The specified product is a duplicate.')
    })

    it('アトミックオペレーションの検証', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RAW_PRODUCTS },
        { collectionName: 'cart', collectionRecords: [] },
      ])
      const inputs = cloneDeep(ADD_INPUTS) as CartItemAddInput[]
      inputs[1].productId = 'abcdefg' // 2件目に存在しない商品IDを指定

      let actual!: Error
      try {
        await cartService.addList(GENERAL_USER, inputs)
      } catch (err) {
        actual = err
      }

      expect(actual).toBeInstanceOf(Error)

      // カートアイテムが追加されていないことを検証
      const cartItems = await cartService.findList(GENERAL_USER)
      expect(cartItems.length).toBe(0)
      // 商品の在庫数が更新されていないことを検証
      const products = await productService.findList()
      expect(products).toMatchObject(PRODUCTS)
    })
  })

  describe('updateList', () => {
    it('ベーシックケース', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RAW_PRODUCTS },
        { collectionName: 'cart', collectionRecords: RAW_CART_ITEMS },
      ])
      const inputs: CartItemUpdateInput[] = CART_ITEMS.map(item => {
        return { id: item.id, quantity: item.quantity + 1 }
      })

      const actual = await cartService.updateList(GENERAL_USER, inputs)

      expect(actual.length).toBe(inputs.length)
      for (let i = 0; i < actual.length; i++) {
        const actualItem = actual[i]
        const input = inputs[i]
        const updatedCartItem = (await storeService.cartDao.fetch(actualItem.id))!
        const updatedProduct = (await storeService.productDao.fetch(actualItem.productId))!
        const beforeCartItem = CART_ITEMS.find(item => item.id === actualItem.id)!
        const beforeProduct = PRODUCTS.find(product => product.id === actualItem.productId)!
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
        { collectionName: 'products', collectionRecords: RAW_PRODUCTS },
        {
          collectionName: 'cart',
          // 自ユーザー以外のカートアイテムをテストデータ投入
          collectionRecords: RAW_CART_ITEMS.map(item => {
            return { ...item, uid: 'test.general.xxx' }
          }),
        },
      ])
      const updateItems = CART_ITEMS.map(item => {
        return { id: item.id, quantity: item.quantity + 1 }
      })

      let actual!: InputValidationError
      try {
        await cartService.updateList(GENERAL_USER, updateItems)
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe('You cannot access the specified cart item.')
    })

    it('在庫数を上回る数をカートアイテムに設定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RAW_PRODUCTS },
        { collectionName: 'cart', collectionRecords: RAW_CART_ITEMS },
      ])
      const updateItem = CART_ITEMS[0]
      const input = { id: updateItem.id, quantity: updateItem.quantity }
      const product = PRODUCTS.find(product => product.id === updateItem.productId)!
      input.quantity += product.stock + 1 // 在庫数を上回る数を設定

      let actual!: InputValidationError
      try {
        await cartService.updateList(GENERAL_USER, [input])
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe('The product is out of stock.')
    })

    it('カートアイテムの数量にマイナス値を設定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RAW_PRODUCTS },
        { collectionName: 'cart', collectionRecords: RAW_CART_ITEMS },
      ])
      const updateItem = CART_ITEMS[0]
      const input = { id: updateItem.id, quantity: updateItem.quantity }
      input.quantity = -1 // マイナス値を設定

      let actual!: ValidationErrors
      try {
        await cartService.updateList(GENERAL_USER, [input])
      } catch (err) {
        actual = err
      }

      expect(actual.detail[0].property).toBe('quantity')
      expect(actual.detail[0].constraints).toHaveProperty('isPositive')
    })

    it('更新対象のカートアイテムを重複指定していた場合', async () => {
      const inputs = [
        { id: CART_ITEMS[0].id, quantity: CART_ITEMS[0].quantity },
        { id: CART_ITEMS[0].id, quantity: CART_ITEMS[0].quantity },
      ]

      let actual!: InputValidationError
      try {
        await cartService.updateList(GENERAL_USER, inputs)
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe('The specified cart item is a duplicate.')
    })

    it('アトミックオペレーションの検証', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RAW_PRODUCTS },
        { collectionName: 'cart', collectionRecords: RAW_CART_ITEMS },
      ])
      const inputs = [
        { id: CART_ITEMS[0].id, quantity: CART_ITEMS[0].quantity },
        { id: CART_ITEMS[1].id, quantity: CART_ITEMS[1].quantity },
      ]
      inputs[0].quantity = 2
      inputs[1].quantity = 9999999999 // 2件目に在庫数を上回る数を設定

      let actual!: Error
      try {
        await cartService.updateList(GENERAL_USER, inputs)
      } catch (err) {
        actual = err
      }

      expect(actual).toBeInstanceOf(Error)

      // カートアイテムが更新されていないことを検証
      const cartItems = await cartService.findList(GENERAL_USER)
      expect(cartItems).toMatchObject(CART_ITEMS)
      // 商品の在庫数が更新されていないことを検証
      const products = await productService.findList()
      expect(products).toMatchObject(PRODUCTS)
    })
  })

  describe('removeList', () => {
    it('ベーシックケース', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RAW_PRODUCTS },
        { collectionName: 'cart', collectionRecords: RAW_CART_ITEMS },
      ])
      const removeIds = CART_ITEMS.map(item => item.id)

      const actual = await cartService.removeList(GENERAL_USER, removeIds)

      expect(actual.length).toBe(removeIds.length)
      for (let i = 0; i < actual.length; i++) {
        const actualItem = actual[i]
        const updatedProduct = (await storeService.productDao.fetch(actualItem.productId))!
        const beforeCartItem = CART_ITEMS.find(item => item.id === actualItem.id)!
        const beforeProduct = PRODUCTS.find(product => product.id === actualItem.productId)!
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
        { collectionName: 'products', collectionRecords: RAW_PRODUCTS },
        {
          collectionName: 'cart',
          // 自ユーザー以外のカートアイテムをテストデータ投入
          collectionRecords: RAW_CART_ITEMS.map(item => {
            return { ...item, uid: 'test.general.xxx' }
          }),
        },
      ])
      const removeIds = CART_ITEMS.map(item => item.id)

      let actual!: InputValidationError
      try {
        await cartService.removeList(GENERAL_USER, removeIds)
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe('You cannot access the specified cart item.')
    })

    it('削除対象のカートアイテムを重複指定していた場合', async () => {
      const removeIds = [CART_ITEMS[0].id, CART_ITEMS[0].id]

      let actual!: InputValidationError
      try {
        await cartService.removeList(GENERAL_USER, removeIds)
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe('The specified cart item is a duplicate.')
    })

    it('アトミックオペレーションの検証', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RAW_PRODUCTS },
        { collectionName: 'cart', collectionRecords: RAW_CART_ITEMS },
      ])
      const removeIds = CART_ITEMS.map(item => item.id)
      removeIds[1] = 'cartItemXXX' // 2件目に存在しないカートアイテムIDを設定

      let actual!: Error
      try {
        await cartService.removeList(GENERAL_USER, removeIds)
      } catch (err) {
        actual = err
      }

      expect(actual).toBeInstanceOf(Error)

      // カートアイテムが削除されていないことを検証
      const cartItems = await cartService.findList(GENERAL_USER)
      expect(cartItems).toEqual(CART_ITEMS)
      // 商品の在庫数が更新されていないことを検証
      const products = await productService.findList()
      expect(products).toEqual(PRODUCTS)
    })
  })

  describe('checkout', () => {
    it('ベーシックケース', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: RAW_PRODUCTS },
        { collectionName: 'cart', collectionRecords: RAW_CART_ITEMS },
      ])

      const actual = await cartService.checkoutCart(GENERAL_USER)

      expect(actual).toBeTruthy()
      // カートアイテムが削除されてることを検証
      const cartItems = await cartService.findList(GENERAL_USER)
      expect(cartItems.length).toBe(0)
    })
  })
})
