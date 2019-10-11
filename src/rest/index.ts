import { Module } from '@nestjs/common'
import { RESTCartModule } from './modules/cart'
import { RESTProductModule } from './modules/product'
import { RESTStorageModule } from './modules/storage'

@Module({
  imports: [RESTProductModule, RESTCartModule, RESTStorageModule],
})
export class RESTContainerModule {}
