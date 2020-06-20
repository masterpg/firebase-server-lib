import * as path from 'path'
import { Controller, Get, Inject, Module, Param, Req, Res } from '@nestjs/common'
import { Request, Response } from 'express'
import { StorageServiceDI, StorageServiceModule } from '../../../../../src/lib'
import { config } from '../../../../../src/config'

//========================================================================
//
//  Implementation
//
//========================================================================

@Controller('storage')
class MockStorageController {
  constructor(@Inject(StorageServiceDI.symbol) protected readonly storageService: StorageServiceDI.type) {}

  @Get(':nodeId')
  async serveFile(@Req() req: Request, @Res() res: Response, @Param('nodeId') nodeId: string): Promise<Response> {
    return this.storageService.serveFile(req, res, nodeId)
  }
}

@Module({
  controllers: [MockStorageController],
  imports: [StorageServiceModule],
})
class MockStorageRESTModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { MockStorageRESTModule }
