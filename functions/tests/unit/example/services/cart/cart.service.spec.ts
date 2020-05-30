import { CartItem, CartItemAddInput, CartItemEditResponse, CartServiceDI, Product, ProductServiceDI } from '../../../../../src/example/services'
import { DevUtilsServiceDI, DevUtilsServiceModule, InputValidationError, ValidationErrors } from '../../../../../src/lib'
import DevUtilsGQLModule from '../../../../../src/example/gql/dev'
import { GENERAL_USER } from '../../../../helpers/common/data'
import GQLContainerModule from '../../../../../src/example/gql/gql.module'
import { OmitEntityTimestamp } from '../../../../../src/firestore-ex'
import { Test } from '@nestjs/testing'
import { cloneDeep } from 'lodash'
import { initApp } from '../../../../../src/example/base'

jest.setTimeout(25000)
initApp()

//========================================================================
//
//  Test data
//
//========================================================================

const PRODUCTS: OmitEntityTimestamp<Product>[] = [
  { id: 'product1', title: 'iPad 4 Mini', price: 500.01, stock: 3 },
  { id: 'product2', title: 'Fire HD 8 Tablet', price: 80.99, stock: 5 },
  { id: 'product3', title: 'MediaPad T5 10', price: 150.8, stock: 10 },
]

const CART_ITEMS: OmitEntityTimestamp<CartItem>[] = [
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
  let cartService: CartServiceDI.type
  let productService: ProductServiceDI.type

  beforeEach(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [GQLContainerModule, DevUtilsGQLModule],
    }).compile()

    devUtilsService = testingModule.get<DevUtilsServiceDI.type>(DevUtilsServiceDI.symbol)
    cartService = testingModule.get<CartServiceDI.type>(CartServiceDI.symbol)
    productService = testingModule.get<ProductServiceDI.type>(ProductServiceDI.symbol)
  })

  describe('findList', () => {
    it('カートアイテムIDを指定しない場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: PRODUCTS },
        { collectionName: 'cart', collectionRecords: CART_ITEMS },
      ])

      const actual = await cartService.findList(GENERAL_USER)

      expect(actual).toMatchObject(CART_ITEMS)
    })

    it('カートアイテムIDを1つ指定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: PRODUCTS },
        { collectionName: 'cart', collectionRecords: CART_ITEMS },
      ])
      const cartItem = CART_ITEMS[0]

      const actual = await cartService.findList(GENERAL_USER, [cartItem.id])

      expect(actual).toMatchObject([cartItem])
    })

    it('カートアイテムIDを複数指定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: PRODUCTS },
        { collectionName: 'cart', collectionRecords: CART_ITEMS },
      ])
      const ids = [CART_ITEMS[0].id, CART_ITEMS[1].id]

      const actual = await cartService.findList(GENERAL_USER, ids)

      expect(actual).toMatchObject([CART_ITEMS[0], CART_ITEMS[1]])
    })

    it('一部存在しない商品IDを指定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: PRODUCTS },
        { collectionName: 'cart', collectionRecords: CART_ITEMS },
      ])
      const ids = ['cartItemXXX', CART_ITEMS[0].id]

      const actual = await cartService.findList(GENERAL_USER, ids)

      expect(actual).toMatchObject([CART_ITEMS[0]])
    })

    it('全て存在しない商品IDを指定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: PRODUCTS },
        { collectionName: 'cart', collectionRecords: CART_ITEMS },
      ])
      const ids = ['cartItemXXX', 'cartItemYYY']

      const actual = await cartService.findList(GENERAL_USER, ids)

      expect(actual.length).toBe(0)
    })

    it('存在しないカートアイテムIDを指定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: PRODUCTS },
        { collectionName: 'cart', collectionRecords: CART_ITEMS },
      ])
      const actual = await cartService.findList(GENERAL_USER, ['cartItemXXX'])

      expect(actual.length).toBe(0)
    })
  })

  describe('addList', () => {
    const ADD_CART_ITEMS = cloneDeep(CART_ITEMS).map(item => {
      delete item.id
      delete item.uid
      return item
    }) as CartItemAddInput[]

    it('ベーシックケース', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: PRODUCTS },
        { collectionName: 'cart', collectionRecords: [] },
      ])
      const addItems = cloneDeep(ADD_CART_ITEMS)
      const expectedItems = addItems.map(addItem => {
        const product = PRODUCTS.find(product => product.id === addItem.productId)!
        return {
          ...addItem,
          product: {
            id: product.id,
            stock: product.stock - addItem.quantity,
          },
        }
      }) as CartItemEditResponse[]

      const actual = await cartService.addList(GENERAL_USER, addItems)

      expect(actual.length).toBe(addItems.length)
      for (let i = 0; i < actual.length; i++) {
        // 戻り値の検証
        const actualItem = actual[i]
        expect(actualItem.id).toEqual(expect.anything())
        expect(actualItem.uid).toBe(GENERAL_USER.uid)
        expect(actualItem).toMatchObject(expectedItems[i])
        // カートアイテムが追加されているか検証
        const addedItem = (await cartService.findList(GENERAL_USER, [actualItem.id]))[0]
        expect(addedItem).toMatchObject(addItems[i])
        // 商品の在庫が更新されているか検証
        const product = (await productService.findList([actualItem.productId]))[0]
        expect(product).toMatchObject(actualItem.product)
      }
    })

    it('存在しない商品を指定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: [] },
        { collectionName: 'cart', collectionRecords: [] },
      ])
      const addItem = cloneDeep(ADD_CART_ITEMS[0])
      addItem.productId = 'abcdefg'

      let actual!: InputValidationError
      try {
        await cartService.addList(GENERAL_USER, [addItem])
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe('The specified product could not be found.')
    })

    it('既に存在するカートアイテムを追加しようとした場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: PRODUCTS },
        { collectionName: 'cart', collectionRecords: CART_ITEMS },
      ])
      const addItem = cloneDeep(ADD_CART_ITEMS[0]) as CartItemAddInput

      let actual!: InputValidationError
      try {
        await cartService.addList(GENERAL_USER, [addItem])
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe('The specified cart item already exists.')
    })

    it('在庫数を上回る数をカートアイテムに設定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: PRODUCTS },
        { collectionName: 'cart', collectionRecords: [] },
      ])
      const addItem = cloneDeep(ADD_CART_ITEMS[0]) as CartItemAddInput
      addItem.quantity = 4 // 在庫数を上回る数を設定

      let actual!: InputValidationError
      try {
        await cartService.addList(GENERAL_USER, [addItem])
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe('The product is out of stock.')
    })

    it('カートアイテムの数量にマイナス値を設定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: PRODUCTS },
        { collectionName: 'cart', collectionRecords: [] },
      ])
      const addItem = cloneDeep(ADD_CART_ITEMS[0]) as CartItemAddInput
      addItem.quantity = -1 // マイナス値を設定

      let actual!: ValidationErrors
      try {
        await cartService.addList(GENERAL_USER, [addItem])
      } catch (err) {
        actual = err
      }

      expect(actual.detail[0].property).toBe('quantity')
      expect(actual.detail[0].constraints).toHaveProperty('isPositive')
    })

    it('カートアイテムの商品を重複指定していた場合', async () => {
      const addItems = [cloneDeep(ADD_CART_ITEMS[0]), cloneDeep(ADD_CART_ITEMS[0])]

      let actual!: InputValidationError
      try {
        await cartService.addList(GENERAL_USER, addItems)
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe('The specified product is a duplicate.')
    })

    it('アトミックオペレーションの検証', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: PRODUCTS },
        { collectionName: 'cart', collectionRecords: [] },
      ])
      const addItems = cloneDeep(ADD_CART_ITEMS) as CartItemAddInput[]
      addItems[1].productId = 'abcdefg' // 2件目に存在しない商品IDを指定

      let actual!: Error
      try {
        await cartService.addList(GENERAL_USER, addItems)
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
        { collectionName: 'products', collectionRecords: PRODUCTS },
        { collectionName: 'cart', collectionRecords: CART_ITEMS },
      ])
      const updateItems = CART_ITEMS.map(item => {
        return { ...item, quantity: item.quantity + 1 }
      })
      const expectedItems = updateItems.map(item => {
        const product = PRODUCTS.find(product => product.id === item.productId)!
        return { ...item, product: { id: product.id, stock: product.stock - 1 } }
      })

      const actual = await cartService.updateList(GENERAL_USER, updateItems)

      expect(actual.length).toBe(updateItems.length)
      for (let i = 0; i < actual.length; i++) {
        // 戻り値の検証
        expect(actual[i]).toMatchObject(expectedItems[i])
        // カートアイテムが更新されているか検証
        const updatedItem = (await cartService.findList(GENERAL_USER, [updateItems[i].id]))[0]
        expect(updatedItem).toMatchObject(updateItems[i])
        // 商品の在庫が更新されているか検証
        const updatedProduct = (await productService.findList([expectedItems[i].productId]))[0]
        expect(updatedProduct).toMatchObject(expectedItems[i].product)
      }
    })

    it('自ユーザー以外のカートアイテムを変更しようとした場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: PRODUCTS },
        {
          collectionName: 'cart',
          // 自ユーザー以外のカートアイテムをテストデータ投入
          collectionRecords: CART_ITEMS.map(item => {
            return { ...item, uid: 'test.general.xxx' }
          }),
        },
      ])
      const updateItems = CART_ITEMS.map(item => {
        return { ...item, quantity: item.quantity + 1 }
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
        { collectionName: 'products', collectionRecords: PRODUCTS },
        { collectionName: 'cart', collectionRecords: CART_ITEMS },
      ])
      const updateItem = cloneDeep(CART_ITEMS[0]) as CartItem
      const product = PRODUCTS.find(product => product.id === updateItem.productId)!
      updateItem.quantity += product.stock + 1 // 在庫数を上回る数を設定

      let actual!: InputValidationError
      try {
        await cartService.updateList(GENERAL_USER, [updateItem])
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe('The product is out of stock.')
    })

    it('カートアイテムの数量にマイナス値を設定した場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: PRODUCTS },
        { collectionName: 'cart', collectionRecords: CART_ITEMS },
      ])
      const updateItem = cloneDeep(CART_ITEMS[0]) as CartItem
      updateItem.quantity = -1 // マイナス値を設定

      let actual!: ValidationErrors
      try {
        await cartService.updateList(GENERAL_USER, [updateItem])
      } catch (err) {
        actual = err
      }

      expect(actual.detail[0].property).toBe('quantity')
      expect(actual.detail[0].constraints).toHaveProperty('isPositive')
    })

    it('更新対象のカートアイテムを重複指定していた場合', async () => {
      const updateItems = [cloneDeep(CART_ITEMS[0]), cloneDeep(CART_ITEMS[0])]

      let actual!: InputValidationError
      try {
        await cartService.updateList(GENERAL_USER, updateItems)
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe('The specified cart item is a duplicate.')
    })

    it('アトミックオペレーションの検証', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: PRODUCTS },
        { collectionName: 'cart', collectionRecords: CART_ITEMS },
      ])
      const updateItems = cloneDeep(CART_ITEMS) as CartItem[]
      updateItems[0].quantity = 2
      updateItems[1].quantity = 9999999999 // 2件目に在庫数を上回る数を設定

      let actual!: Error
      try {
        await cartService.updateList(GENERAL_USER, updateItems)
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
        { collectionName: 'products', collectionRecords: PRODUCTS },
        { collectionName: 'cart', collectionRecords: CART_ITEMS },
      ])
      const removeIds = CART_ITEMS.map(item => item.id)
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

      const actual = await cartService.removeList(GENERAL_USER, removeIds)

      expect(actual.length).toBe(removeIds.length)
      for (let i = 0; i < actual.length; i++) {
        // 戻り値の検証
        expect(actual[i]).toMatchObject(expectedItems[i])
        // カートアイテムが削除されているか検証
        const removeItemId = removeIds[i]
        const removedItem = (await cartService.findList(GENERAL_USER, [removeItemId]))[0]
        expect(removedItem).toBeUndefined()
        // 商品の在庫が更新されているか検証
        const updatedProductId = expectedItems[i].productId
        const updatedProduct = (await productService.findList([updatedProductId]))[0]
        expect(updatedProduct).toMatchObject(expectedItems[i].product)
      }
    })

    it('自ユーザー以外のカートアイテムを削除しようとした場合', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: PRODUCTS },
        {
          collectionName: 'cart',
          // 自ユーザー以外のカートアイテムをテストデータ投入
          collectionRecords: CART_ITEMS.map(item => {
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
        { collectionName: 'products', collectionRecords: PRODUCTS },
        { collectionName: 'cart', collectionRecords: CART_ITEMS },
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
      expect(cartItems).toMatchObject(CART_ITEMS)
      // 商品の在庫数が更新されていないことを検証
      const products = await productService.findList()
      expect(products).toMatchObject(PRODUCTS)
    })
  })

  describe('checkout', () => {
    it('ベーシックケース', async () => {
      await devUtilsService.putTestStoreData([
        { collectionName: 'products', collectionRecords: PRODUCTS },
        { collectionName: 'cart', collectionRecords: CART_ITEMS },
      ])

      const actual = await cartService.checkoutCart(GENERAL_USER)

      expect(actual).toBeTruthy()
      // カートアイテムが削除されてることを検証
      const cartItems = await cartService.findList(GENERAL_USER)
      expect(cartItems.length).toBe(0)
    })
  })
})
