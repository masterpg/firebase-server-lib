import { Controller, Get, Inject, Param, UseInterceptors } from '@nestjs/common'
import { Product } from './types'
import { ProductServiceDI } from '../../services/product'
import { TransformInterceptor } from '../../../nest'

@Controller('products')
@UseInterceptors(TransformInterceptor)
export class ProductController {
  constructor(@Inject(ProductServiceDI.symbol) protected readonly productService: ProductServiceDI.type) {}

  @Get()
  async findAll(): Promise<Product[]> {
    return this.productService.findAll()
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Product | undefined> {
    return this.productService.findOne(id)
  }
}
