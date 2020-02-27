import { Product, ProductServiceDI } from '../../../../../src/example/services'
import { AppBaseModule } from '../../../../../src/example/app.module'
import { LibDevUtilsServiceDI } from '../../../../../src/lib'
import { Test } from '@nestjs/testing'
import { initApp } from '../../../../../src/example/initializer'

jest.setTimeout(25000)
initApp()

//========================================================================
//
//  Test data
//
//========================================================================

const PRODUCTS: Product[] = [
  { id: 'product1', title: 'iPad 4 Mini', price: 500.01, stock: 3 },
  { id: 'product2', title: 'Fire HD 8 Tablet', price: 80.99, stock: 5 },
  { id: 'product3', title: 'MediaPad T5 10', price: 150.8, stock: 10 },
]

//========================================================================
//
//  Tests
//
//========================================================================

describe('ProductService', () => {
  let productService: ProductServiceDI.type
  let devUtilsService: LibDevUtilsServiceDI.type

  beforeEach(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [AppBaseModule],
    }).compile()

    productService = testingModule.get<ProductServiceDI.type>(ProductServiceDI.symbol)
    devUtilsService = testingModule.get<LibDevUtilsServiceDI.type>(LibDevUtilsServiceDI.symbol)
  })

  describe('findList', () => {
    it('商品IDを指定しない場合', async () => {
      await devUtilsService.putTestData([{ collectionName: 'products', collectionRecords: PRODUCTS }])

      const actual = await productService.findList()

      expect(actual).toMatchObject(PRODUCTS)
    })

    it('商品IDを1つ指定した場合', async () => {
      await devUtilsService.putTestData([{ collectionName: 'products', collectionRecords: PRODUCTS }])
      const product = PRODUCTS[0]

      const actual = await productService.findList([product.id])

      expect(actual[0]).toMatchObject(product)
    })

    it('商品IDの配列を指定した場合', async () => {
      await devUtilsService.putTestData([{ collectionName: 'products', collectionRecords: PRODUCTS }])
      const ids = [PRODUCTS[0].id, PRODUCTS[1].id]

      const actual = await productService.findList(ids)

      expect(actual).toMatchObject([PRODUCTS[0], PRODUCTS[1]])
    })

    it('存在しない商品IDを指定した場合', async () => {
      await devUtilsService.putTestData([{ collectionName: 'products', collectionRecords: PRODUCTS }])
      const actual = await productService.findList(['productXXX'])

      expect(actual.length).toBe(0)
    })

    it('一部存在しない商品IDを指定した場合', async () => {
      await devUtilsService.putTestData([{ collectionName: 'products', collectionRecords: PRODUCTS }])
      const ids = ['productXXX', PRODUCTS[0].id]

      const actual = await productService.findList(ids)

      expect(actual).toMatchObject([PRODUCTS[0]])
    })

    it('全て存在しない商品IDを指定した場合', async () => {
      await devUtilsService.putTestData([{ collectionName: 'products', collectionRecords: PRODUCTS }])
      const ids = ['productXXX', 'productYYY']

      const actual = await productService.findList(ids)

      expect(actual.length).toBe(0)
    })
  })
})
