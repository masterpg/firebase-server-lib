import { AppStorageServiceDI, AppStorageServiceModule } from '../../services'
import { Controller, Get, Inject, Module, Param, Req, Res } from '@nestjs/common'
import { Request, Response } from 'express'
import { BaseRESTModule } from '../base'

//========================================================================
//
//  Implementation
//
//========================================================================

@Controller()
class StorageController {
  constructor(@Inject(AppStorageServiceDI.symbol) protected readonly storageService: AppStorageServiceDI.type) {}

  @Get(':nodeId')
  async serveFile(@Req() req: Request, @Res() res: Response, @Param('nodeId') nodeId: string): Promise<Response> {
    return this.storageService.serveFile(req, res, nodeId)
  }
}

@Module({
  controllers: [StorageController],
  imports: [BaseRESTModule, AppStorageServiceModule],
})
class StorageRESTModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export default StorageRESTModule
