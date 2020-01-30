import * as path from 'path'
import { AuthGuard, AuthRoleType, IdToken, LibStorageServiceDI, Roles, User } from '../../../../src/lib'
import { Controller, Get, Inject, Module, Param, Req, Res, UseGuards, UseInterceptors } from '@nestjs/common'
import { Request, Response } from 'express'
import { Product } from '../services/types'
import { TransformInterceptor } from '../../../../src/lib/nest'
import { config } from '../../../../src/lib/base'

@Controller('api/rest/products')
@UseInterceptors(TransformInterceptor)
export class MockProductController {
  @Get()
  async findList(): Promise<Product[]> {
    return [{ id: 'product1', name: 'Product1' }]
  }
}

@Controller('api/rest/site')
@UseInterceptors(TransformInterceptor)
export class MockSiteController {
  @Get('public/config')
  async getPublicConfig(): Promise<{ siteName: string }> {
    return { siteName: 'TestSite' }
  }

  @Get('admin/config')
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async getAdminConfig(@User() user: IdToken): Promise<{ uid: string; apiKey: string }> {
    return { uid: user.uid, apiKey: '162738495' }
  }
}

@Controller('api/storage')
export class MockStorageController {
  constructor(@Inject(LibStorageServiceDI.symbol) protected readonly storageService: LibStorageServiceDI.type) {}

  @Get(path.join(config.storage.usersDir, '*'))
  async serveUserFile(@Req() req: Request, @Res() res: Response, @Param() params: string[]): Promise<Response> {
    const filePath = path.join(config.storage.usersDir, params[0])
    return this.storageService.serveUserFile(req, res, filePath)
  }

  @Get('*')
  async serveAppFile(@Req() req: Request, @Res() res: Response, @Param() params: string[]): Promise<Response> {
    const filePath = params[0]
    return this.storageService.serveAppFile(req, res, filePath)
  }
}

@Module({
  controllers: [MockProductController, MockSiteController, MockStorageController],
  providers: [LibStorageServiceDI.provider],
})
export class MockRESTContainerModule {}
