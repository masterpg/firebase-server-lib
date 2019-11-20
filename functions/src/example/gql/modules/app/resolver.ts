import { IdToken, User, UserGuard } from '../../../../lib'
import { Inject, UseGuards } from '@nestjs/common'
import { Query, Resolver } from '@nestjs/graphql'
import { AppServiceDI } from '../../../services/app'

@Resolver()
export class AppResolver {
  constructor(@Inject(AppServiceDI.symbol) protected readonly commService: AppServiceDI.type) {}

  @Query()
  @UseGuards(UserGuard)
  async customToken(@User() user: IdToken): Promise<string> {
    return this.commService.customToken(user)
  }
}
