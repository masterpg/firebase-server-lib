import { Module } from '@nestjs/common'
import { StorageController } from './controller'

@Module({
  controllers: [StorageController],
})
export class RESTStorageModule {}
