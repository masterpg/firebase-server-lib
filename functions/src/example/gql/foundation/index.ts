import { AppConfigResponse, FoundationServiceDI, FoundationServiceModule } from '../../services'
import { Query, Resolver } from '@nestjs/graphql'
import { AuthModule } from '../../../lib'
import { BaseGQLModule } from '../base'
import { Inject } from '@nestjs/common'
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
}

@Module({
  providers: [FoundationResolver],
  imports: [BaseGQLModule, FoundationServiceModule, AuthModule],
})
class FoundationGQLModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export default FoundationGQLModule
