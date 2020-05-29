import { AdminSettings, PartnerSettings, PublicSettings } from '../../services'
import {
  AuthGuard,
  AuthGuardModule,
  AuthRoleType,
  CORSAppGuardDI,
  CORSGuardModule,
  CORSMiddleware,
  CORSMiddlewareModule,
  IdToken,
  Roles,
  UserArg,
} from '../../../../../src/lib/nest'
import { GraphQLModule, Query, Resolver } from '@nestjs/graphql'
import { MiddlewareConsumer, Module, RequestMethod, UseGuards } from '@nestjs/common'
import { getMockGQLModuleOptions } from '../base'

//========================================================================
//
//  Implementation
//
//========================================================================

@Resolver()
class DummyResolver {
  @Query('publicSettings')
  async getPublicSettings(): Promise<PublicSettings> {
    return { publicKey: 'Public Key' }
  }

  @Query('partnerSettings')
  async getPartnerSettings(): Promise<PartnerSettings> {
    return { partnerKey: 'Partner Key' }
  }

  @Query('adminSettings')
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async getAdminSettings(@UserArg() user: IdToken): Promise<AdminSettings> {
    // console.log(`User '${user.uid}' has accessed the GraphQL's 'adminSettings'.`)
    return { adminKey: 'Admin Key' }
  }
}

@Module({
  providers: [DummyResolver],
  imports: [GraphQLModule.forRoot(getMockGQLModuleOptions()), AuthGuardModule],
})
class DummyGQLModule {}

@Module({
  providers: [DummyResolver],
  imports: [GraphQLModule.forRoot(getMockGQLModuleOptions()), AuthGuardModule, CORSMiddlewareModule],
})
class DummyCORSGQLModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}

@Module({
  providers: [DummyResolver, CORSAppGuardDI.provider],
  imports: [GraphQLModule.forRoot(getMockGQLModuleOptions()), AuthGuardModule, CORSGuardModule],
})
class DummyCORSGuardGQLModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export { DummyGQLModule, DummyCORSGQLModule, DummyCORSGuardGQLModule }
