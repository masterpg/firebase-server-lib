import { AuthMiddleware, CORSAppGuardDI, CORSMiddleware, HTTPLoggingAppInterceptorDI } from '../../nest'
import { AuthServiceModule, CORSServiceModule } from '../../services'
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import { ExampleShopRESTModule } from './shop'
import KeepAliveRESTModule from '../base/keepalive'
import { LoggingServiceModule } from '../../services/base-services/logging'

//========================================================================
//
//  Implementation
//
//========================================================================

const restModules = [ExampleShopRESTModule, KeepAliveRESTModule]

@Module({
  providers: [HTTPLoggingAppInterceptorDI.provider, CORSAppGuardDI.provider],
  imports: [LoggingServiceModule, CORSServiceModule, AuthServiceModule, ...restModules],
})
class RESTContainerModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
    consumer.apply(AuthMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export default RESTContainerModule
