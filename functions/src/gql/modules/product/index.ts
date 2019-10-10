import { Module } from '@nestjs/common'
import { ProductResolver } from './resolver'
import { ProductServiceDI } from '../../../services/business'

@Module({
  providers: [ProductServiceDI.provider, ProductResolver],
})
export class GQLProductModule {}
