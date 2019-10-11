import { Module } from '@nestjs/common'
import { StorageResolver } from './resolver'
import { StorageServiceDI } from '../../../services/business'

@Module({
  providers: [StorageServiceDI.provider, StorageResolver],
})
export class GQLStorageModule {}
