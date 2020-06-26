import { Controller, Get, Inject, Module, Param, Req, Res } from '@nestjs/common'
import { Request, Response } from 'express'
import { StorageServiceDI, StorageServiceModule } from '../../../../../src/lib'

//========================================================================
//
//  Implementation
//
//========================================================================

@Controller()
class MockStorageController {
  constructor(@Inject(StorageServiceDI.symbol) protected readonly storageService: StorageServiceDI.type) {}

  @Get('*')
  async serveFile(@Req() req: Request, @Res() res: Response, @Param() params: string[]): Promise<Response> {
    const filePath = params[0]
    return this.storageService.streamFile(req, res, filePath)
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
