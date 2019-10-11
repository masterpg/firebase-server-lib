import { Inject, UseGuards, UseInterceptors } from '@nestjs/common'
import { Query, Resolver } from '@nestjs/graphql'
import { AppServiceDI } from '../../../services/business'
import { IdToken } from '../../../services/base'
import { User } from '../../../nest'
import { UserGuard } from '../../../nest/guards/user'

@Resolver()
export class AppResolver {
  constructor(@Inject(AppServiceDI.symbol) protected readonly commService: AppServiceDI.type) {}

  @Query()
  @UseGuards(UserGuard)
  async customToken(@User() user: IdToken): Promise<string> {
    return this.commService.customToken(user)
  }
}
