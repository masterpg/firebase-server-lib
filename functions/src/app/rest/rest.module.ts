import { CORSAppGuardDI, CORSMiddleware, HTTPLoggingAppInterceptorDI } from '../nest'
import { CORSServiceModule, LoggingServiceModule } from '../services'
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import { ExampleShopRESTModule } from './example'
import KeepAliveRESTModule from './keepalive'

//========================================================================
//
//  Implementation
//
//========================================================================

const restModules = [KeepAliveRESTModule, ExampleShopRESTModule]

@Module({
  providers: [HTTPLoggingAppInterceptorDI.provider, CORSAppGuardDI.provider],
  imports: [LoggingServiceModule, CORSServiceModule, ...restModules],
})
class RESTContainerModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export default RESTContainerModule
