import * as path from 'path'
import { AppConfigResponse, FoundationServiceDI, FoundationServiceModule } from '../../services'
import { AuthGuard, AuthGuardModule, IdToken, User } from '../../../lib'
import { BaseGQLModule, getGQLModuleOptions } from '../base'
import { GraphQLModule, Query, Resolver } from '@nestjs/graphql'
import { Inject, UseGuards } from '@nestjs/common'
import { Module } from '@nestjs/common'
import { config } from '../../../config'

@Resolver()
export class FoundationResolver {
  constructor(@Inject(FoundationServiceDI.symbol) protected readonly foundationService: FoundationServiceDI.type) {}

  @Query()
  async appConfig(): Promise<AppConfigResponse> {
    return this.foundationService.appConfig()
  }

  @Query()
  @UseGuards(AuthGuard)
  async customToken(@User() user: IdToken): Promise<string> {
    return this.foundationService.customToken(user)
  }
}

const schemaFile = `${path.join(config.gql.schema.moduleDir, 'foundation/foundation.graphql')}`

@Module({
  providers: [FoundationResolver],
  imports: [BaseGQLModule, GraphQLModule.forRoot(getGQLModuleOptions([schemaFile])), FoundationServiceModule, AuthGuardModule],
})
export default class FoundationGQLModule {}
