import * as admin from 'firebase-admin'
import { Test, TestingModule } from '@nestjs/testing'
import { WriteReadyObserver, getDocumentById } from '../../../../../src/lib/base'
import { LibDevUtilsServiceDI } from '../../../../../src/lib/services'
import { MockBaseAppModule } from '../../../../mocks/lib'
import { Module } from '@nestjs/common'
import { Transaction } from '@google-cloud/firestore'
import { arrayToDict } from 'web-base-lib'
import { initLibTestApp } from '../../../../helpers/lib/init'

jest.setTimeout(25000)
initLibTestApp()

//========================================================================
//
//  Test helpers
//
//========================================================================

@Module({
  imports: [MockBaseAppModule],
})
class MockAppModule {}

//========================================================================
//
//  Tests
//
//========================================================================

describe('WriteReadyObserver', () => {
  interface TestProduct {
    id: string
    title: string
    price: number
    stock: number
  }

  interface TestCartItem {
    id: string
    uid: string
    productId: string
    title: string
    price: number
    quantity: number
  }

  interface CartItemUpdateInput {
    id: string
    quantity: number
  }

  let devUtilsService: LibDevUtilsServiceDI.type

  const PRODUCTS: TestProduct[] = [
    { id: 'product1', title: 'iPad 4 Mini', price: 500.01, stock: 3 },
    { id: 'product2', title: 'Fire HD 8 Tablet', price: 80.99, stock: 5 },
    { id: 'product3', title: 'MediaPad T5 10', price: 150.8, stock: 10 },
  ]

  const CART_ITEMS: TestCartItem[] = [
    {
      id: 'cartItem1',
      uid: `12345`,
      productId: 'product1',
      title: 'iPad 4 Mini',
      price: 500.01,
      quantity: 1,
    },
    {
      id: 'cartItem2',
      uid: `12345`,
      productId: 'product2',
      title: 'Fire HD 8 Tablet',
      price: 80.99,
      quantity: 2,
    },
  ]

  beforeEach(async () => {
    const testingModule: TestingModule = await Test.createTestingModule({
      imports: [MockAppModule],
    }).compile()

    devUtilsService = testingModule.get<LibDevUtilsServiceDI.type>(LibDevUtilsServiceDI.symbol)
  })

  /**
   * 複数のカートアイテムの更新を行います。
   * @param inputs カートアイテムの更新データを指定
   */
  async function updateCartItems(inputs: CartItemUpdateInput[]): Promise<void> {
    const db = admin.firestore()
    await db.runTransaction(async transaction => {
      const writeReady = new WriteReadyObserver(inputs.length)
      const promises: Promise<void>[] = []
      for (const input of inputs) {
        promises.push(updateCartItem(transaction, input, writeReady))
      }
      await Promise.all(promises)
    })
  }

  /**
   * カートアイテムの更新を行います。
   * @param transaction
   * @param input
   * @param writeReady
   */
  async function updateCartItem(transaction: Transaction, input: CartItemUpdateInput, writeReady: WriteReadyObserver): Promise<void> {
    // カートアイテムを取得
    const cartItemSnap = await getDocumentById<TestCartItem>('test_cart', input.id, transaction)
    if (!cartItemSnap.exists) {
      throw new Error(`The specified cart item '${input.id}' could not be found.`)
    }
    const cartItem = cartItemSnap.data()!

    // カートアイテムの商品を取得
    const productSnap = await getDocumentById<TestProduct>('test_products', cartItem.productId, transaction)
    if (!productSnap.exists) {
      throw new Error(`The specified cart item '${cartItem.productId}' could not be found.`)
    }
    const product = productSnap.data()!

    // 画面で入力されたカートアイテムの商品数量をもとに最新の在庫数を算出
    const addedQuantity = input.quantity - cartItem.quantity
    product.stock -= addedQuantity
    if (product.stock < 0) {
      throw new Error(`The stock of the product '${product.id}' was insufficient.`)
    }

    // 書き込み準備ができるまで待機
    // 重要:
    //   トランザクションの書き込みを行うには事前に読み込みを終えていなければならない。
    //   そのためここでは他のカートアイテム更新時の読み込みが終わるまで待機している。
    await writeReady.wait()

    // カートアイテムを入力値で更新
    transaction.update(cartItemSnap.ref, input)
    // 商品の在庫数更新を実行
    transaction.set(productSnap.ref, product, { merge: true })
  }

  it('ベーシックケース', async () => {
    // テストデータ投入
    await devUtilsService.putTestData([
      { collectionName: 'test_products', collectionRecords: PRODUCTS },
      { collectionName: 'test_cart', collectionRecords: CART_ITEMS },
    ])
    // カートアイテム更新用の引数を生成
    const inputs = CART_ITEMS.map<CartItemUpdateInput & { productId: string }>(item => {
      // カートアイテムの商品数量を+1
      return { id: item.id, quantity: item.quantity + 1, productId: item.productId }
    })
    // カートアイテム更新の商品データの期待値を生成
    const expectedProductDict = inputs.reduce<{ [id: string]: TestProduct }>((result, input) => {
      const product = PRODUCTS.find(product => product.id === input.productId)!
      // 商品の在庫数量を-1
      result[product.id] = { ...product, stock: product.stock - 1 }
      return result
    }, {})

    // カートアイテム更新を実行
    await updateCartItems(inputs)

    for (const input of inputs) {
      // カートアイテムが更新されているか検証
      const cartItemSnap = await getDocumentById<TestCartItem>('test_cart', input.id)
      const cartItem = cartItemSnap.data()!
      expect(cartItem).toMatchObject(input)
      // 商品の在庫が更新されているか検証
      const productSnap = await getDocumentById<TestProduct>('test_products', cartItem.productId)
      const product = productSnap.data()!
      expect(product.stock).toBe(expectedProductDict[input.productId].stock)
    }
  })

  it('トランザクションが効いているか検証', async () => {
    // テストデータ投入
    await devUtilsService.putTestData([
      { collectionName: 'test_products', collectionRecords: PRODUCTS },
      { collectionName: 'test_cart', collectionRecords: CART_ITEMS },
    ])
    // カートアイテム更新用の引数を生成
    const inputs = CART_ITEMS.map<CartItemUpdateInput & { productId: string }>(item => {
      // カートアイテムの商品数量を+1
      return { id: item.id, quantity: item.quantity + 1, productId: item.productId }
    })
    inputs[1].quantity = 9999999999 // 2件目に在庫数を上回る数を設定

    // カートアイテム更新を実行
    let actual!: Error
    try {
      await updateCartItems(inputs)
    } catch (err) {
      actual = err
    }

    expect(actual).toBeInstanceOf(Error)

    const cartItemDict = arrayToDict(CART_ITEMS, 'id')
    const productDict = arrayToDict(PRODUCTS, 'id')
    for (const input of inputs) {
      // カートアイテムが更新されていないことを検証
      const cartItemSnap = await getDocumentById<TestCartItem>('test_cart', input.id)
      const cartItem = cartItemSnap.data()!
      expect(cartItem).toMatchObject(cartItemDict[input.id])
      // 商品が更新されていないことを検証
      const productSnap = await getDocumentById<TestProduct>('test_products', input.productId)
      const product = productSnap.data()!
      expect(product).toMatchObject(productDict[product.id])
    }
  })
})
