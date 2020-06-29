import { AppStoreServiceDI, AppStoreServiceModule, Product } from './store'
import { Inject, Module } from '@nestjs/common'

//========================================================================
//
//  Implementation
//
//========================================================================

class ProductService {
  constructor(@Inject(AppStoreServiceDI.symbol) protected readonly storeService: AppStoreServiceDI.type) {}

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  async findList(ids?: string[]): Promise<Product[]> {
    if (ids && ids.length) {
      const dict: { [id: string]: Product } = {}
      await Promise.all(
        ids.map(async id => {
          const product = await this.storeService.productDao.fetch(id)
          if (product) dict[product.id] = product
        })
      )
      return ids.reduce((result, id) => {
        const product = dict[id]
        product && result.push(product)
        return result
      }, [] as Product[])
    } else {
      return await this.storeService.productDao.fetchAll()
    }
  }
}

namespace ProductServiceDI {
  export const symbol = Symbol(ProductService.name)
  export const provider = {
    provide: symbol,
    useClass: ProductService,
  }
  export type type = ProductService
}

@Module({
  providers: [ProductServiceDI.provider],
  exports: [ProductServiceDI.provider],
  imports: [AppStoreServiceModule],
})
class ProductServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { ProductServiceDI, ProductServiceModule, Product }
