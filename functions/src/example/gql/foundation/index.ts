import { AppConfigResponse, FoundationServiceDI } from '../../services'
import { AuthGuard, IdToken, User } from '../../../lib'
import { Inject, UseGuards } from '@nestjs/common'
import { Query, Resolver } from '@nestjs/graphql'
import { Module } from '@nestjs/common'

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
})
export class GQLFoundationModule {}
