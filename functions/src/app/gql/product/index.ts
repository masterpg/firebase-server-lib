import { Args, Query, Resolver } from '@nestjs/graphql'
import { Product, ProductServiceDI, ProductServiceModule } from '../../services'
import { BaseGQLModule } from '../base'
import { Inject } from '@nestjs/common'
import { Module } from '@nestjs/common'

//========================================================================
//
//  Implementation
//
//========================================================================

@Resolver('Product')
export class ProductResolver {
  constructor(@Inject(ProductServiceDI.symbol) protected readonly productService: ProductServiceDI.type) {}

  @Query('products')
  async products(@Args('ids') ids?: string[]): Promise<Product[]> {
    return this.productService.findList(ids)
  }
}

@Module({
  providers: [ProductResolver],
  imports: [BaseGQLModule, ProductServiceModule],
})
class ProductGQLModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export default ProductGQLModule
