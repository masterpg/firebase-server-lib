import { CORSAppGuardDI, CORSMiddleware, CORSModule, HTTPLoggingAppInterceptorDI, LoggingModule } from '../../lib'
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import CartRESTModule from './cart'
import KeepAliveRESTModule from './keepalive'
import ProductRESTModule from './product'

//========================================================================
//
//  Implementation
//
//========================================================================

const restModules = [KeepAliveRESTModule, CartRESTModule, ProductRESTModule]

@Module({
  providers: [HTTPLoggingAppInterceptorDI.provider, CORSAppGuardDI.provider],
  imports: [LoggingModule, CORSModule, ...restModules],
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
