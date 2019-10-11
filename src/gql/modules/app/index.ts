import { AppResolver } from './resolver'
import { AppServiceDI } from '../../../services/business'
import { Module } from '@nestjs/common'

@Module({
  providers: [AppServiceDI.provider, AppResolver],
})
export class GQLAppModule {}
