import { Module } from '@nestjs/common'
import { ProductResolver } from './resolver'
import { ProductServiceDI } from '../../../services'

@Module({
  providers: [ProductServiceDI.provider, ProductResolver],
})
export class GQLProductModule {}
