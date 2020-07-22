import { Controller, Get, Inject, Module, Param, Req, Res } from '@nestjs/common'
import { Request, Response } from 'express'
import { StorageServiceDI, StorageServiceModule } from '../../services'
import { BaseRESTModule } from '../base'

//========================================================================
//
//  Implementation
//
//========================================================================

@Controller()
class StorageController {
  constructor(@Inject(StorageServiceDI.symbol) protected readonly storageService: StorageServiceDI.type) {}

  @Get(':nodeId')
  async serveFile(@Req() req: Request, @Res() res: Response, @Param('nodeId') nodeId: string): Promise<Response> {
    return this.storageService.serveFile(req, res, nodeId)
  }
}

@Module({
  controllers: [StorageController],
  imports: [BaseRESTModule, StorageServiceModule],
})
class StorageRESTModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export default StorageRESTModule
