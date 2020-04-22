import { AdminSettings, PartnerSettings, PublicSettings } from '../services/types'
import { AuthGuard, AuthRoleType, DateTimeScalar, IdToken, Roles, User, getGqlModuleBaseOptions } from '../../../../src/lib'
import { GraphQLModule, Query, Resolver } from '@nestjs/graphql'
import { Module, UseGuards } from '@nestjs/common'
import { config } from '../../../../src/config'
import merge = require('lodash/merge')

@Resolver()
export class UnitTestResolver {
  @Query('publicSettings')
  async getPublicSettings(): Promise<PublicSettings> {
    return { publicKey: 'Public Key' }
  }

  @Query('partnerSettings')
  async getPartnerSettings(): Promise<PartnerSettings> {
    return { partnerKey: 'Partner Key' }
  }

  @Query('adminSettings')
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async getAdminSettings(@User() user: IdToken): Promise<AdminSettings> {
    // console.log(`User '${user.uid}' has accessed the GraphQL's 'adminSettings'.`)
    return { adminKey: 'Admin Key' }
  }
}

const baseOptions = getGqlModuleBaseOptions(config.gql.scanPaths)

@Module({
  providers: [DateTimeScalar, UnitTestResolver],
  imports: [
    GraphQLModule.forRoot(
      merge(baseOptions, {
        path: '/gql',
      })
    ),
  ],
})
export class MockGQLContainerModule {}
