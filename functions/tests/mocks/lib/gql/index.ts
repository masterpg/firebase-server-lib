import { DateTimeScalar, getGqlModuleBaseOptions } from '../../../../src/lib'
import { GraphQLModule, Query, Resolver } from '@nestjs/graphql'
import { Product, Site } from '../services/types'
import { Module } from '@nestjs/common'
const merge = require('lodash/merge')

@Resolver('Product')
export class MockProductResolver {
  @Query('products')
  async products(): Promise<Product[]> {
    return [{ id: 'product1', name: 'Product1' }]
  }
}

@Resolver('Site')
export class MockSiteResolver {
  @Query('site')
  async outline(): Promise<Site> {
    return { name: 'TestSite' }
  }
}

const baseOptions = getGqlModuleBaseOptions('tests/mocks/lib/gql')

@Module({
  providers: [DateTimeScalar, MockProductResolver, MockSiteResolver],
  imports: [
    GraphQLModule.forRoot(
      merge(baseOptions, {
        path: '/api/gql',
      })
    ),
  ],
})
export class MockGQLContainerModule {}
