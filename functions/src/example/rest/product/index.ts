import { Controller, Get, Inject, Module, Param } from '@nestjs/common'
import { Product, ProductServiceDI } from '../../services'
import { BaseRESTModule } from '../base'

@Controller('products')
export class ProductController {
  constructor(@Inject(ProductServiceDI.symbol) protected readonly productService: ProductServiceDI.type) {}

  @Get()
  async findList(): Promise<Product[]> {
    return this.productService.findList()
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Product | undefined> {
    const list = await this.productService.findList([id])
    return list.length ? list[0] : undefined
  }
}

@Module({
  controllers: [ProductController],
  providers: [ProductServiceDI.provider],
  imports: [BaseRESTModule],
})
export default class ProductRESTModule {}
