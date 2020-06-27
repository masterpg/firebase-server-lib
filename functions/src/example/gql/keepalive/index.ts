import { AuthGuard, AuthGuardModule, AuthRoleType, Roles } from '../../../lib'
import { Query, Resolver } from '@nestjs/graphql'
import { BaseGQLModule } from '../base'
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
  imports: [BaseGQLModule, AuthGuardModule],
})
class KeepAliveGQLModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export default KeepAliveGQLModule
