import { Controller, Get, Inject, Module, Query } from '@nestjs/common'
import { Product, ProductServiceDI, ProductServiceModule } from '../../services'
import { BaseRESTModule } from '../base'

//========================================================================
//
//  Implementation
//
//========================================================================

@Controller('products')
class ProductController {
  constructor(@Inject(ProductServiceDI.symbol) protected readonly productService: ProductServiceDI.type) {}

  @Get()
  async findList(@Query('ids') ids?: string[]): Promise<Product[]> {
    return this.productService.findList(ids)
  }
}

@Module({
  controllers: [ProductController],
  imports: [BaseRESTModule, ProductServiceModule],
})
class ProductRESTModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export default ProductRESTModule
