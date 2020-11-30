import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import { AuthDataResult, AuthServiceDI, AuthServiceModule, IdToken, UserInfo, UserInfoInput, UserServiceDI, UserServiceModule } from '../../services'
import { GQLContext, GQLContextArg } from '../base'
import { Inject, Module, UnauthorizedException } from '@nestjs/common'
import { Request } from 'express'

//========================================================================
//
//  Implementation
//
//========================================================================

@Resolver()
export class UserResolver {
  constructor(
    @Inject(AuthServiceDI.symbol) protected readonly authService: AuthServiceDI.type,
    @Inject(UserServiceDI.symbol) protected readonly userService: UserServiceDI.type
  ) {}

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  @Query(returns => AuthDataResult)
  async authData(@GQLContextArg() context: GQLContext): Promise<AuthDataResult> {
    const user = await this.m_getIdToken(context.req)
    return this.userService.getAuthData(user.uid)
  }

  @Mutation(returns => UserInfo)
  async setOwnUserInfo(@GQLContextArg() context: GQLContext, @Args('input', { type: () => UserInfoInput }) input: UserInfoInput): Promise<UserInfo> {
    const user = await this.m_getIdToken(context.req)
    return this.userService.setUserInfo(user.uid, input)
  }

  @Mutation(returns => Boolean)
  async deleteOwnUser(@GQLContextArg() context: GQLContext): Promise<boolean> {
    const user = await this.m_getIdToken(context.req)
    await this.userService.deleteUser(user.uid)
    return true
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  private async m_getIdToken(req: Request): Promise<IdToken> {
    const user = await this.authService.getIdToken(req)
    if (!user) {
      throw new UnauthorizedException('Authorization failed because the ID token could not be obtained from the HTTP request header.')
    }
    return user
  }
}

@Module({
  providers: [UserResolver],
  imports: [AuthServiceModule, UserServiceModule],
})
class UserGQLModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { UserGQLModule }
