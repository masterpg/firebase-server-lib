import { Module } from '@nestjs/common'
import { StorageResolver } from './resolver'
import { StorageServiceDI } from 'web-server-lib'

@Module({
  providers: [StorageServiceDI.provider, StorageResolver],
})
export class GQLStorageModule {}
