import { Controller, Get, Inject, Module, Param, Req, Res, UseInterceptors } from '@nestjs/common'
import { Request, Response } from 'express'
import { StorageServiceDI, TransformInterceptor } from '../../src'
import { Product } from './gql.schema'

@Controller('unit/rest/products')
@UseInterceptors(TransformInterceptor)
export class MockProductController {
  @Get()
  async findList(): Promise<Product[]> {
    return [{ id: 'product1', name: 'Product1' }]
  }
}

@Controller('unit/storage')
export class MockStorageController {
  constructor(@Inject(StorageServiceDI.symbol) protected readonly storageService: StorageServiceDI.type) {}

  @Get('*')
  async sendFile(@Req() req: Request, @Res() res: Response, @Param() params: string[]): Promise<Response> {
    const filePath = params[0]
    return this.storageService.sendFile(req, res, filePath)
  }
}

@Module({
  controllers: [MockProductController, MockStorageController],
  providers: [StorageServiceDI.provider],
})
export class MockRESTContainerModule {}
