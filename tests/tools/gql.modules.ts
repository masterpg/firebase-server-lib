import { GraphQLModule, Query, Resolver } from '@nestjs/graphql'
import { Module } from '@nestjs/common'
import { Product } from './gql.schema'
import { getGqlModuleBaseOptions } from '../../src'
const merge = require('lodash/merge')

@Resolver('Product')
export class MockProductResolver {
  @Query('products')
  async products(): Promise<Product[]> {
    return [{ id: 'product1', name: 'Product1' }]
  }
}

const baseOptions = getGqlModuleBaseOptions('tests/tools')

@Module({
  providers: [MockProductResolver],
  imports: [
    GraphQLModule.forRoot(
      merge(baseOptions, {
        path: '/unit/gql',
      })
    ),
  ],
})
export class MockGQLContainerModule {}
