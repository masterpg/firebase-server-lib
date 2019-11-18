import { Module } from '@nestjs/common'
import { StorageResolver } from './resolver'
import { StorageServiceDI } from '../../../../lib'

@Module({
  providers: [StorageServiceDI.provider, StorageResolver],
})
export class GQLStorageModule {}
