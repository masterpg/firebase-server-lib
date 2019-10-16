import { Args, Query, Resolver } from '@nestjs/graphql'
import { Product, ProductServiceDI } from '../../../services'
import { Inject } from '@nestjs/common'

@Resolver('Product')
export class ProductResolver {
  constructor(@Inject(ProductServiceDI.symbol) protected readonly productService: ProductServiceDI.type) {}

  @Query('products')
  async products(@Args('ids') ids?: string[]): Promise<Product[]> {
    return this.productService.findList(ids)
  }
}
