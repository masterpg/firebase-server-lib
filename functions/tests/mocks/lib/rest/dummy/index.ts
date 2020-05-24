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
  TransformInterceptor,
  User,
} from '../../../../../src/lib/nest'
import { Controller, Get, MiddlewareConsumer, Module, RequestMethod, UseGuards, UseInterceptors } from '@nestjs/common'

//========================================================================
//
//  Implementation
//
//========================================================================

@Controller('dummyRESTService')
@UseInterceptors(TransformInterceptor)
class DummyController {
  @Get('public/settings')
  async getPublicSettings(): Promise<{ publicKey: string }> {
    return { publicKey: 'Public Key' }
  }

  @Get('partner/settings')
  async getPartnerSettings(): Promise<{ partnerKey: string }> {
    return { partnerKey: 'Partner Key' }
  }

  @Get('admin/settings')
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async getAdminSettings(@User() user: IdToken): Promise<{ adminKey: string }> {
    // console.log(`User '${user.uid}' has accessed the REST's 'admin/settings'.`)
    return { adminKey: 'Admin Key' }
  }
}

@Module({
  controllers: [DummyController],
  imports: [AuthGuardModule],
})
class DummyRESTModule {}

@Module({
  controllers: [DummyController],
  imports: [AuthGuardModule, CORSMiddlewareModule],
})
class DummyCORSRESTModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}

@Module({
  controllers: [DummyController],
  providers: [CORSAppGuardDI.provider],
  imports: [AuthGuardModule, CORSGuardModule],
})
class DummyCORSGuardRESTModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export { DummyRESTModule, DummyCORSRESTModule, DummyCORSGuardRESTModule }
