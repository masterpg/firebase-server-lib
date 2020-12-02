import { AuthGuard, Roles } from '../../nest'
import { AuthRoleType, AuthServiceModule } from '../../services'
import { Query, Resolver } from '@nestjs/graphql'
import { Module } from '@nestjs/common'
import { UseGuards } from '@nestjs/common'
import { sleep } from 'web-base-lib'

//========================================================================
//
//  Implementation
//
//========================================================================

@Resolver()
export class KeepAliveResolver {
  @Query()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async keepAlive(): Promise<boolean> {
    await sleep(500)
    return true
  }
}

@Module({
  providers: [KeepAliveResolver],
  imports: [AuthServiceModule],
})
class KeepAliveGQLModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { KeepAliveGQLModule }
