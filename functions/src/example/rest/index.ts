import { Module } from '@nestjs/common'
import { RESTCartModule } from './modules/cart'
import { RESTProductModule } from './modules/product'
import { RESTStorageModule } from './modules/storage'

@Module({
  imports: [RESTStorageModule, RESTProductModule, RESTCartModule],
})
export class RESTContainerModule {}
