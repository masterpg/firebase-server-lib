import * as path from 'path'
import { Controller, Get, Inject, Module, Param, Req, Res } from '@nestjs/common'
import { Request, Response } from 'express'
import { StorageServiceDI, StorageServiceModule } from '../../services'
import { AuthGuardModule } from '../../../lib/nest'
import { BaseRESTModule } from '../base'
import { config } from '../../../config'

//========================================================================
//
//  Implementation
//
//========================================================================

@Controller()
class StorageController {
  constructor(@Inject(StorageServiceDI.symbol) protected readonly storageService: StorageServiceDI.type) {}

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
  imports: [BaseRESTModule, StorageServiceModule, AuthGuardModule],
})
class StorageRESTModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export default StorageRESTModule
