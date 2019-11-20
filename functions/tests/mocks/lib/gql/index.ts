import { DateTimeScalar, getGqlModuleBaseOptions } from '../../../../src/lib/gql'
import { GraphQLModule, Query, Resolver } from '@nestjs/graphql'
import { Module } from '@nestjs/common'
import { Product } from '../services/types'
const merge = require('lodash/merge')

@Resolver('Product')
export class MockProductResolver {
  @Query('products')
  async products(): Promise<Product[]> {
    return [{ id: 'product1', name: 'Product1' }]
  }
}

const baseOptions = getGqlModuleBaseOptions('tests/mocks/lib/gql')

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
