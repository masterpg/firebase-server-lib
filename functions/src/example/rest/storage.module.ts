import { CORSAppGuardDI, CORSMiddleware, CORSServiceModule, HTTPLoggingAppInterceptorDI, LoggingServiceModule } from '../../lib'
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import KeepAliveRESTModule from './keepalive'
import StorageRESTModule from './storage'

@Module({
  providers: [HTTPLoggingAppInterceptorDI.provider, CORSAppGuardDI.provider],
  imports: [LoggingServiceModule, CORSServiceModule, KeepAliveRESTModule, StorageRESTModule],
})
export default class StorageContainerModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}
