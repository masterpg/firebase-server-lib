import { Product, ProductModule, ProductState, ProductsErrorType, StoreError, initStore, store } from '@/store'
import { TestStoreModule } from '../../../../helper/unit'
const cloneDeep = require('lodash/cloneDeep')

initStore()
const productModule = store.product as TestStoreModule<ProductState, ProductModule>

const PRODUCTS: Product[] = [
  { id: 'product1', title: 'iPad 4 Mini', price: 500.01, stock: 1 },
  { id: 'product2', title: 'Fire HD 8 Tablet', price: 80.99, stock: 5 },
  { id: 'product3', title: 'MediaPad T5 10', price: 150.8, stock: 10 },
]

beforeEach(async () => {
  productModule.initState({
    all: cloneDeep(PRODUCTS),
  })
})

describe('all', () => {
  it('ベーシックケース', () => {
    expect(productModule.all).toEqual(PRODUCTS)
  })
})

describe('getById', () => {
  it('ベーシックケース', () => {
    const stateProduct = productModule.state.all[0]

    const actual = productModule.getById(stateProduct.id)

    expect(actual).toEqual(stateProduct)
    expect(actual).not.toBe(stateProduct)
  })

  it('存在しない商品IDを指定した場合', () => {
    const actual = productModule.getById('9999')
    expect(actual).toBeUndefined()
  })
})

describe('set', () => {
  it('ベーシックケース', () => {
    const product = cloneDeep(productModule.state.all[0])
    product.title = 'aaa'

    // 一部のプロパティだけを変更
    const actual = productModule.set({
      id: product.id,
      title: product.title,
    })!

    const stateProduct = productModule.state.all[0]
    expect(actual).toEqual(product)
    expect(actual).not.toBe(stateProduct)
  })

  it('余分なプロパティを含んだ場合', () => {
    const product = cloneDeep(productModule.state.all[0])
    product.zzz = 'zzz'

    const actual = productModule.set(product)!

    expect(actual).not.toHaveProperty('zzz')
  })

  it('存在しない商品IDを指定した場合', () => {
    const product = cloneDeep(productModule.state.all[0])
    product.id = '9999'

    const actual = productModule.set(product)

    expect(actual).toBeUndefined()
  })
})

describe('setAll', () => {
  it('ベーシックケース', () => {
    productModule.setAll(PRODUCTS)
    expect(productModule.state.all).toEqual(PRODUCTS)
    expect(productModule.state.all).not.toBe(PRODUCTS)
  })
})

describe('add', () => {
  it('ベーシックケース', () => {
    const product = cloneDeep(productModule.state.all[0])
    product.id = 'productXXX'
    product.title = 'aaa'
    product.price = 999
    product.stock = 888

    const actual = productModule.add(product)

    const stateProduct = productModule.state.all[productModule.state.all.length - 1]
    expect(actual).toEqual(stateProduct)
    expect(actual).not.toBe(stateProduct)
  })
})

describe('decrementStock', () => {
  it('ベーシックケース', () => {
    const product = cloneDeep(productModule.state.all[0])

    productModule.decrementStock(product.id)

    const stateProduct = productModule.state.all[0]
    expect(stateProduct.id).toBe(product.id)
    expect(stateProduct.stock).toBe(product.stock - 1)
  })

  it('存在しない商品の在庫をデクリメントしようとした場合', () => {
    let actual!: Error
    try {
      productModule.decrementStock('9999')
    } catch (err) {
      actual = err
    }

    expect(actual).toBeInstanceOf(StoreError)
    if (actual instanceof StoreError) {
      expect(actual.errorType).toBe(ProductsErrorType.ItemNotFound)
    }
  })
})

describe('incrementStock', () => {
  it('ベーシックケース', () => {
    const product = cloneDeep(productModule.state.all[0])

    productModule.incrementStock(product.id)

    const stateProduct = productModule.state.all[0]
    expect(stateProduct.id).toBe(product.id)
    expect(stateProduct.stock).toBe(product.stock + 1)
  })

  it('存在しない商品の在庫をインクリメントしようとした場合', () => {
    let actual!: Error
    try {
      productModule.incrementStock('9999')
    } catch (err) {
      actual = err
    }

    expect(actual).toBeInstanceOf(StoreError)
    if (actual instanceof StoreError) {
      expect(actual.errorType).toBe(ProductsErrorType.ItemNotFound)
    }
  })
})
