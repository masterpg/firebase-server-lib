import { AppConfigResponse, AppServiceDI } from '../../../services'
import { AuthGuard, IdToken, User } from '../../../../lib'
import { Inject, UseGuards } from '@nestjs/common'
import { Query, Resolver } from '@nestjs/graphql'
import { Module } from '@nestjs/common'

@Resolver()
export class AppResolver {
  constructor(@Inject(AppServiceDI.symbol) protected readonly appService: AppServiceDI.type) {}

  @Query()
  async appConfig(): Promise<AppConfigResponse> {
    return this.appService.appConfig()
  }

  @Query()
  @UseGuards(AuthGuard)
  async customToken(@User() user: IdToken): Promise<string> {
    return this.appService.customToken(user)
  }
}

@Module({
  providers: [AppResolver],
})
export class GQLAppModule {}
