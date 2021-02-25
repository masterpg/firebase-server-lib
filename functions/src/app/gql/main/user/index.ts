import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import {
  AuthDataResult,
  AuthServiceDI,
  AuthServiceModule,
  IdToken,
  SetUserInfoResult,
  UserInput,
  UserServiceDI,
  UserServiceModule,
} from '../../../services'
import { GQLContext, GQLContextArg, UserArg } from '../../../nest'
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

  @Query()
  async authData(@GQLContextArg() context: GQLContext): Promise<AuthDataResult> {
    const user = await this.m_getIdToken(context.req)
    return this.userService.getAuthData(user.uid)
  }

  @Mutation()
  async setUserInfo(@UserArg() idToken: IdToken, @Args('uid') uid: string, @Args('input') input: UserInput): Promise<SetUserInfoResult> {
    return this.userService.setUserInfo(idToken, uid, input)
  }

  @Mutation()
  async deleteUser(@UserArg() idToken: IdToken, @Args('uid') uid: string): Promise<boolean> {
    await this.userService.deleteUser(idToken, uid)
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
