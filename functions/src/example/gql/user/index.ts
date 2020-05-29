import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import { AuthDataResult, User as UserEntity, UserInfoInput, UserServiceDI, UserServiceModule } from '../../../lib/services'
import { AuthGuardModule, AuthServiceDI, AuthServiceModule, GQLContext, IdToken } from '../../../lib/nest'
import { Inject, Module, UnauthorizedException } from '@nestjs/common'
import { BaseGQLModule } from '../base'
import { GQLCtx } from '../../../lib/gql'
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
  async authData(@GQLCtx() context: GQLContext): Promise<AuthDataResult> {
    const user = await this.m_getIdToken(context.req)
    return this.userService.getAuthData(user.uid)
  }

  @Mutation()
  async setOwnUserInfo(@GQLCtx() context: GQLContext, @Args('input') input: UserInfoInput): Promise<UserEntity> {
    const user = await this.m_getIdToken(context.req)
    return this.userService.setUserInfo(user.uid, input)
  }

  @Mutation()
  async deleteOwnUser(@GQLCtx() context: GQLContext): Promise<boolean> {
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
  imports: [BaseGQLModule, AuthGuardModule, AuthServiceModule, UserServiceModule],
})
class UserGQLModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export default UserGQLModule
