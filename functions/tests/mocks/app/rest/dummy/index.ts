import { AuthGuard, CORSAppGuardDI, CORSMiddleware, Roles, TransformInterceptor, UserArg } from '../../../../../src/app/nest'
import { AuthRoleType, AuthServiceModule, CORSServiceModule, IdToken } from '../../../../../src/app/services'
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
  async getAdminSettings(@UserArg() user: IdToken): Promise<{ adminKey: string }> {
    // console.log(`User '${user.uid}' has accessed the REST's 'admin/settings'.`)
    return { adminKey: 'Admin Key' }
  }
}

@Module({
  controllers: [DummyController],
  imports: [AuthServiceModule],
})
class DummyRESTModule {}

@Module({
  controllers: [DummyController],
  imports: [AuthServiceModule, CORSServiceModule],
})
class DummyCORSRESTModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}

@Module({
  controllers: [DummyController],
  providers: [CORSAppGuardDI.provider],
  imports: [AuthServiceModule, CORSServiceModule],
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
