import {store, StoreError, Product, ProductsErrorType, ProductsModule, ProductsState} from '@/store'
import {utils} from '@/base/utils'
import {TestStoreModule} from '../../../../helper'

const productsModule = store.products as TestStoreModule<ProductsState, ProductsModule>

const PRODUCTS: Product[] = [
  {id: '1', title: 'iPad 4 Mini', price: 500.01, inventory: 1},
  {id: '2', title: 'Fire HD 8 Tablet', price: 80.99, inventory: 5},
  {id: '3', title: 'MediaPad T5 10', price: 150.8, inventory: 10},
]

beforeEach(async () => {
  productsModule.initState({
    all: PRODUCTS,
  })
})

describe('all', () => {
  it('ベーシックケース', () => {
    expect(productsModule.all).toBe(PRODUCTS)
  })
})

describe('getById', () => {
  it('ベーシックケース', () => {
    const product = utils.cloneDeep(productsModule.state.all[0])
    const actual = productsModule.getById(product.id)
    expect(actual).toEqual(product)
  })
  it('存在しない商品IDを指定した場合', () => {
    const actual = productsModule.getById('9999')
    expect(actual).toBeUndefined()
  })
})

describe('all', () => {
  it('ベーシックケース', () => {
    productsModule.setAll(PRODUCTS)
    expect(productsModule.all).toEqual(PRODUCTS)
    expect(productsModule.all).not.toBe(PRODUCTS)
  })
})

describe('decrementInventory', () => {
  it('ベーシックケース', () => {
    const product = utils.cloneDeep(productsModule.state.all[0])
    productsModule.decrementInventory(product.id)
    const actual = productsModule.state.all[0]
    expect(actual.id).toBe(product.id)
    expect(actual.inventory).toBe(product.inventory - 1)
  })
  it('存在しない商品の在庫をデクリメントしようとした場合', () => {
    try {
      productsModule.decrementInventory('9999')
    } catch (e) {
      expect(e).toBeInstanceOf(StoreError)
      if (e instanceof StoreError) {
        expect(e.errorType).toBe(ProductsErrorType.ItemNotFound)
      }
    }
  })
})
