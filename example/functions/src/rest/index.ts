import { Module } from '@nestjs/common'
import { RESTCartModule } from './modules/cart'
import { RESTProductModule } from './modules/product'

@Module({
  imports: [RESTProductModule, RESTCartModule],
})
export class RESTContainerModule {}
