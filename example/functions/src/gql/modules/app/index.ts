import { AppResolver } from './resolver'
import { AppServiceDI } from 'firebase-server-lib'
import { Module } from '@nestjs/common'

@Module({
  providers: [AppServiceDI.provider, AppResolver],
})
export class GQLAppModule {}
