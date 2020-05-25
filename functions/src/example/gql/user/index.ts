import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import { AuthDataResult, User as UserEntity, UserInfoInput, UserServiceDI, UserServiceModule } from '../../../lib/services'
import { AuthGuard, AuthGuardModule, IdToken, User } from '../../../lib/nest'
import { Inject, Module, UseGuards } from '@nestjs/common'
import { BaseGQLModule } from '../base'

//========================================================================
//
//  Implementation
//
//========================================================================

@Resolver()
export class UserResolver {
  constructor(@Inject(UserServiceDI.symbol) protected readonly userService: UserServiceDI.type) {}

  @Query()
  @UseGuards(AuthGuard)
  async authData(@User() user: IdToken): Promise<AuthDataResult> {
    return this.userService.getAuthData(user.uid)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async setOwnUserInfo(@User() user: IdToken, @Args('input') input: UserInfoInput): Promise<UserEntity> {
    return this.userService.setUserInfo(user.uid, input)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async deleteOwnUser(@User() user: IdToken): Promise<boolean> {
    await this.userService.deleteUser(user.uid)
    return true
  }
}

@Module({
  providers: [UserResolver],
  imports: [BaseGQLModule, AuthGuardModule, UserServiceModule],
})
class UserGQLModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export default UserGQLModule
