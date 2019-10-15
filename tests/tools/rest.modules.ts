import { Controller, Get, Module, UseInterceptors } from '@nestjs/common'
import { Product } from './gql.schema'
import { TransformInterceptor } from '../../src'

@Controller('unit/rest/products')
@UseInterceptors(TransformInterceptor)
export class MockProductController {
  @Get()
  async findList(): Promise<Product[]> {
    return [{ id: 'product1', name: 'Product1' }]
  }
}

@Module({
  controllers: [MockProductController],
})
export class MockRESTContainerModule {}
