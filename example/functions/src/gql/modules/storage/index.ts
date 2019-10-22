import { Module } from '@nestjs/common'
import { StorageResolver } from './resolver'
import { StorageServiceDI } from 'firebase-server-lib'

@Module({
  providers: [StorageServiceDI.provider, StorageResolver],
})
export class GQLStorageModule {}
