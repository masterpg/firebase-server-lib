import { CORSAppGuardDI, CORSGuardModule, CORSMiddleware, HTTPLoggingAppInterceptorDI, HTTPLoggingInterceptorModule } from '../../lib/nest'
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import StorageRESTModule from './storage'

@Module({
  providers: [HTTPLoggingAppInterceptorDI.provider, CORSAppGuardDI.provider],
  imports: [HTTPLoggingInterceptorModule, CORSGuardModule, StorageRESTModule],
})
export default class StorageContainerModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}
