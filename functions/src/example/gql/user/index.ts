import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import {
  AuthDataResult,
  AuthServiceDI,
  AuthServiceModule,
  GQLContext,
  GQLContextArg,
  IdToken,
  UserInfo,
  UserInfoInput,
  UserServiceDI,
  UserServiceModule,
} from '../../../lib'
import { Inject, Module, UnauthorizedException } from '@nestjs/common'
import { BaseGQLModule } from '../base'
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

  @Query()
  async authData(@GQLContextArg() context: GQLContext): Promise<AuthDataResult> {
    const user = await this.m_getIdToken(context.req)
    return this.userService.getAuthData(user.uid)
  }

  @Mutation()
  async setOwnUserInfo(@GQLContextArg() context: GQLContext, @Args('input') input: UserInfoInput): Promise<UserInfo> {
    const user = await this.m_getIdToken(context.req)
    return this.userService.setUserInfo(user.uid, input)
  }

  @Mutation()
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
  imports: [BaseGQLModule, AuthServiceModule, UserServiceModule],
})
class UserGQLModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export default UserGQLModule
