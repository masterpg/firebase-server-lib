import { CartResolver } from './resolver'
import { CartServiceDI } from '../../../services'
import { Module } from '@nestjs/common'

@Module({
  providers: [CartServiceDI.provider, CartResolver],
})
export class GQLCartModule {}
