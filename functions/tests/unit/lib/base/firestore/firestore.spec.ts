import * as admin from 'firebase-admin'
import { Test, TestingModule } from '@nestjs/testing'
import { WriteReadyObserver, initLib } from '../../../../../src/lib/base'
import DevUtilsGQLModule from '../../../../../src/example/gql/dev'
import { FirestoreEx } from '../../../../../src/firestore-ex'
import { LibDevUtilsServiceDI } from '../../../../../src/lib/services'
import { findDuplicateItems } from 'web-base-lib'

jest.setTimeout(25000)
initLib()

//========================================================================
//
//  Tests
//
//========================================================================

describe('WriteReadyObserver', () => {
  interface TestProduct {
    id: string
    title: string
    stock: number
  }

  interface Order {
    productId: string
    orderNum: number
  }

  let devUtilsService: LibDevUtilsServiceDI.type

  beforeEach(async () => {
    const testingModule: TestingModule = await Test.createTestingModule({
      imports: [DevUtilsGQLModule],
    }).compile()

    devUtilsService = testingModule.get<LibDevUtilsServiceDI.type>(LibDevUtilsServiceDI.symbol)
  })

  /**
   * 複数商品の注文を一括で行います。
   * ※同じ商品を複数注文することできません。
   * @param inputs カートアイテムの更新データを指定
   */
  async function orders(inputs: Order[]): Promise<void> {
    // 同じ商品を複数注文されていなかチェック
    if (findDuplicateItems(inputs, 'productId').length > 0) {
      throw new Error(`It is not possible to order more than one product at a time.`)
    }

    const firestoreEx = new FirestoreEx(admin.firestore())
    await firestoreEx.runTransaction(async () => {
      const writeReady = new WriteReadyObserver(inputs.length)
      await Promise.all(inputs.map(input => order(firestoreEx, input, writeReady)))
    })
  }

  /**
   * 商品の注文を行います。
   * @param firestoreEx
   * @param input
   * @param writeReady
   */
  async function order(firestoreEx: FirestoreEx, input: Order, writeReady: WriteReadyObserver): Promise<void> {
    const productDao = firestoreEx.collection<TestProduct>({ path: 'test-products' })

    // 商品を取得
    const product = await productDao.fetch(input.productId)
    if (!product) {
      throw new Error(`The specified product '${input.productId}' could not be found.`)
    }

    // 在庫数のチェック
    const newStock = product.stock - input.orderNum
    if (newStock < 0) {
      throw new Error(`The product '${product.id}' is out of stock.`)
    }

    // 他の注文の書き込み準備ができるまで待機
    await writeReady.wait()

    // 商品の在庫数を更新
    await productDao.update({
      id: product.id,
      stock: newStock,
    })
  }

  it('ベーシックケース', async () => {
    // テストデータ投入
    await devUtilsService.putTestData([
      {
        collectionName: 'test-products',
        collectionRecords: [
          { id: 'product1', title: 'product1', stock: 5 },
          { id: 'product2', title: 'product2', stock: 5 },
          { id: 'product3', title: 'product3', stock: 5 },
        ] as TestProduct[],
      },
    ])

    // 複数商品の注文を実行
    const inputs: Order[] = [
      { productId: 'product1', orderNum: 1 },
      { productId: 'product2', orderNum: 2 },
      { productId: 'product3', orderNum: 3 },
    ]
    await orders(inputs)

    // 在庫数が変更されたことを検証
    const firestoreEx = new FirestoreEx(admin.firestore())
    const productDao = firestoreEx.collection<TestProduct>({ path: 'test-products' })
    const product1 = (await productDao.fetch('product1'))!
    expect(product1.stock).toBe(4)
    const product2 = (await productDao.fetch('product2'))!
    expect(product2.stock).toBe(3)
    const product3 = (await productDao.fetch('product3'))!
    expect(product3.stock).toBe(2)
  })

  it('トランザクションが効いているか検証', async () => {
    // テストデータ投入
    await devUtilsService.putTestData([
      {
        collectionName: 'test-products',
        collectionRecords: [
          { id: 'product1', title: 'product1', stock: 5 },
          { id: 'product2', title: 'product2', stock: 5 },
          { id: 'product3', title: 'product3', stock: 5 },
        ] as TestProduct[],
      },
    ])

    // 複数商品の注文を実行
    let actual!: Error
    try {
      const inputs: Order[] = [
        { productId: 'product1', orderNum: 1 },
        { productId: 'product2', orderNum: 6 }, // 在庫数以上に注文
        { productId: 'product3', orderNum: 1 },
      ]
      await orders(inputs)
    } catch (err) {
      actual = err
    }

    expect(actual).toBeInstanceOf(Error)

    // 在庫数が変更されていないことを検証
    const firestoreEx = new FirestoreEx(admin.firestore())
    const productDao = firestoreEx.collection<TestProduct>({ path: 'test-products' })
    const product1 = (await productDao.fetch('product1'))!
    expect(product1.stock).toBe(5)
    const product2 = (await productDao.fetch('product2'))!
    expect(product2.stock).toBe(5)
    const product3 = (await productDao.fetch('product3'))!
    expect(product3.stock).toBe(5)
  })
})
