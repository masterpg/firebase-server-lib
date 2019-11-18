import { DateTimeScalar, getGqlModuleBaseOptions } from '../../src/lib'
import { GraphQLModule, Query, Resolver } from '@nestjs/graphql'
import { Module } from '@nestjs/common'
import { Product } from './gql.schema'
const merge = require('lodash/merge')

@Resolver('Product')
export class MockProductResolver {
  @Query('products')
  async products(): Promise<Product[]> {
    return [{ id: 'product1', name: 'Product1' }]
  }
}

const baseOptions = getGqlModuleBaseOptions('tests/helpers')

@Module({
  providers: [DateTimeScalar, MockProductResolver],
  imports: [
    GraphQLModule.forRoot(
      merge(baseOptions, {
        path: '/unit/gql',
      })
    ),
  ],
})
export class MockGQLContainerModule {}
