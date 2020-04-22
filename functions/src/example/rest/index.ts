import { Module } from '@nestjs/common'
import { RESTCartModule } from './cart'
import { RESTProductModule } from './product'
import { RESTStorageModule } from './storage'

@Module({
  imports: [RESTStorageModule, RESTProductModule, RESTCartModule],
})
export class RESTContainerModule {}
