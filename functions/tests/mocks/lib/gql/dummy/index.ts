import { AdminSettings, PartnerSettings, PublicSettings } from '../../gql.schema'
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
  User,
} from '../../../../../src/lib/nest'
import { GraphQLModule, Query, Resolver } from '@nestjs/graphql'
import { MiddlewareConsumer, Module, RequestMethod, UseGuards } from '@nestjs/common'
import { getMockGQLModuleOptions } from '../base'

@Resolver()
export class DummyResolver {
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
  async getAdminSettings(@User() user: IdToken): Promise<AdminSettings> {
    // console.log(`User '${user.uid}' has accessed the GraphQL's 'adminSettings'.`)
    return { adminKey: 'Admin Key' }
  }
}

@Module({
  providers: [DummyResolver],
  imports: [GraphQLModule.forRoot(getMockGQLModuleOptions()), AuthGuardModule],
})
export class DummyGQLModule {}

@Module({
  providers: [DummyResolver],
  imports: [GraphQLModule.forRoot(getMockGQLModuleOptions()), AuthGuardModule, CORSMiddlewareModule],
})
export class DummyCORSGQLModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}

@Module({
  providers: [DummyResolver, CORSAppGuardDI.provider],
  imports: [GraphQLModule.forRoot(getMockGQLModuleOptions()), AuthGuardModule, CORSGuardModule],
})
export class DummyCORSGuardGQLModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}
