import { Module } from '@nestjs/common'
import { ProductController } from './controller'
import { ProductServiceDI } from '../../../services'

@Module({
  controllers: [ProductController],
  providers: [ProductServiceDI.provider],
})
export class RESTProductModule {}
