import { AppServiceDI, IdToken, User, UserGuard } from 'firebase-server-lib'
import { Inject, UseGuards } from '@nestjs/common'
import { Query, Resolver } from '@nestjs/graphql'

@Resolver()
export class AppResolver {
  constructor(@Inject(AppServiceDI.symbol) protected readonly commService: AppServiceDI.type) {}

  @Query()
  @UseGuards(UserGuard)
  async customToken(@User() user: IdToken): Promise<string> {
    return this.commService.customToken(user)
  }
}
