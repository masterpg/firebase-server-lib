import * as path from 'path'
import { Args, GraphQLModule, Query, Resolver } from '@nestjs/graphql'
import { BaseGQLModule, getGQLModuleOptions } from '../base'
import { Product, ProductServiceDI, ProductServiceModule } from '../../services'
import { Inject } from '@nestjs/common'
import { Module } from '@nestjs/common'
import { config } from '../../../config'

@Resolver('Product')
export class ProductResolver {
  constructor(@Inject(ProductServiceDI.symbol) protected readonly productService: ProductServiceDI.type) {}

  @Query('products')
  async products(@Args('ids') ids?: string[]): Promise<Product[]> {
    return this.productService.findList(ids)
  }
}

const schemaFile = `${path.join(config.gql.schema.moduleDir, 'product/product.graphql')}`

@Module({
  providers: [ProductResolver],
  imports: [BaseGQLModule, GraphQLModule.forRoot(getGQLModuleOptions([schemaFile])), ProductServiceModule],
})
export default class ProductGQLModule {}
