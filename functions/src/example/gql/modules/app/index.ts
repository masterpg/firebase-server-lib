import { AppResolver } from './resolver'
import { AppServiceDI } from '../../../../lib'
import { Module } from '@nestjs/common'

@Module({
  providers: [AppServiceDI.provider, AppResolver],
})
export class GQLAppModule {}
