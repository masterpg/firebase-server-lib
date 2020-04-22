import { AuthGuard, AuthRoleType, IdToken, LibStorageServiceDI, Roles, User } from '../../../../src/lib'
import { Controller, Get, Inject, Module, Param, Req, Res, UseGuards, UseInterceptors } from '@nestjs/common'
import { Request, Response } from 'express'
import { TransformInterceptor } from '../../../../src/lib/nest'

@Controller('rest/unit')
@UseInterceptors(TransformInterceptor)
export class UnitTestController {
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

@Controller('storage')
export class MockStorageController {
  constructor(@Inject(LibStorageServiceDI.symbol) protected readonly storageService: LibStorageServiceDI.type) {}

  @Get('*')
  async serveFile(@Req() req: Request, @Res() res: Response, @Param() params: string[]): Promise<Response> {
    const filePath = params[0]
    return this.storageService.serveFile(req, res, filePath)
  }
}

@Module({
  controllers: [UnitTestController, MockStorageController],
  providers: [LibStorageServiceDI.provider],
})
export class MockRESTContainerModule {}
