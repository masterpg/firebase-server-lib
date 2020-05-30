import * as path from 'path'
import { AppStorageServiceDI, AppStorageServiceModule } from '../../services'
import { Controller, Get, Inject, Module, Param, Req, Res } from '@nestjs/common'
import { Request, Response } from 'express'
import { AuthGuardModule } from '../../../lib'
import { BaseRESTModule } from '../base'
import { config } from '../../../config'

//========================================================================
//
//  Implementation
//
//========================================================================

@Controller()
class StorageController {
  constructor(@Inject(AppStorageServiceDI.symbol) protected readonly storageService: AppStorageServiceDI.type) {}

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
  controllers: [StorageController],
  imports: [BaseRESTModule, AppStorageServiceModule, AuthGuardModule],
})
class StorageRESTModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export default StorageRESTModule
