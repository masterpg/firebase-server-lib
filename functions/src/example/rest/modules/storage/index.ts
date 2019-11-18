import { Controller, Get, Inject, Module, Param, Req, Res } from '@nestjs/common'
import { Request, Response } from 'express'
import { StorageServiceDI } from '../../../../lib'

@Controller('storage')
export class StorageController {
  constructor(@Inject(StorageServiceDI.symbol) protected readonly storageService: StorageServiceDI.type) {}

  @Get('*')
  async sendFile(@Req() req: Request, @Res() res: Response, @Param() params: string[]): Promise<Response> {
    const filePath = params[0]
    return this.storageService.sendFile(req, res, filePath)
  }
}

@Module({
  controllers: [StorageController],
  providers: [StorageServiceDI.provider],
})
export class RESTStorageModule {}
