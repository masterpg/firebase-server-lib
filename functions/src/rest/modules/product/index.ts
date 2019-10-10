import { Module } from '@nestjs/common'
import { ProductController } from './controller'
import { ProductServiceDI } from '../../services/product'

@Module({
  controllers: [ProductController],
  providers: [ProductServiceDI.provider],
})
export class RESTProductModule {}
