import { CORSAppGuardDI, CORSMiddleware, HTTPLoggingAppInterceptorDI } from '../../nest'
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import { CORSServiceModule } from '../../services'
import { ExampleShopRESTModule } from './shop'
import KeepAliveRESTModule from '../base/keepalive'
import { LoggingServiceModule } from '../../services/base/logging'

//========================================================================
//
//  Implementation
//
//========================================================================

const restModules = [ExampleShopRESTModule, KeepAliveRESTModule]

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
