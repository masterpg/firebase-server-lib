import { CORSAppGuardDI, CORSGuardModule, CORSMiddleware, HttpLoggingAppInterceptorDI, HttpLoggingInterceptorModule } from '../../lib/nest'
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import StorageRESTModule from './storage'

@Module({
  providers: [HttpLoggingAppInterceptorDI.provider, CORSAppGuardDI.provider],
  imports: [HttpLoggingInterceptorModule, CORSGuardModule, StorageRESTModule],
})
export default class StorageContainerModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}
