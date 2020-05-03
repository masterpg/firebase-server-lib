import { AppConfigResponse, FoundationServiceDI, FoundationServiceModule } from '../../services'
import { AuthGuard, AuthGuardModule, IdToken, User } from '../../../lib'
import { Inject, UseGuards } from '@nestjs/common'
import { Query, Resolver } from '@nestjs/graphql'
import { BaseGQLModule } from '../base'
import { Module } from '@nestjs/common'

//========================================================================
//
//  Implementation
//
//========================================================================

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

@Module({
  providers: [FoundationResolver],
  imports: [BaseGQLModule, FoundationServiceModule, AuthGuardModule],
})
class FoundationGQLModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export default FoundationGQLModule
