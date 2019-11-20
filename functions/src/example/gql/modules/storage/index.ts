import { Module } from '@nestjs/common'
import { StorageResolver } from './resolver'
import { StorageServiceDI } from '../../../services/storage'

@Module({
  providers: [StorageServiceDI.provider, StorageResolver],
})
export class GQLStorageModule {}
