import { AuthGuard, AuthRoleType, DateTimeScalar, IdToken, Roles, User, getGqlModuleBaseOptions } from '../../../../src/lib'
import { GraphQLModule, Query, Resolver } from '@nestjs/graphql'
import { Module, UseGuards } from '@nestjs/common'
import { Product, SiteAdminConfig, SitePublicConfig } from '../services/types'
const merge = require('lodash/merge')

@Resolver('Product')
export class MockProductResolver {
  @Query('products')
  async products(): Promise<Product[]> {
    return [{ id: 'product1', name: 'Product1' }]
  }
}

@Resolver()
export class MockSiteResolver {
  @Query('sitePublicConfig')
  async getPublicConfig(): Promise<SitePublicConfig> {
    return { siteName: 'TestSite' }
  }

  @Query('siteAdminConfig')
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async getAdminConfig(@User() user: IdToken): Promise<SiteAdminConfig> {
    return { uid: user.uid, apiKey: '162738495' }
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
