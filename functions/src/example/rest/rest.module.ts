import { CORSAppGuardDI, CORSGuardModule, CORSMiddleware, HTTPLoggingAppInterceptorDI, HTTPLoggingInterceptorModule } from '../../lib'
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import CartRESTModule from './cart'
import ProductRESTModule from './product'

//========================================================================
//
//  Implementation
//
//========================================================================

const restModules = [CartRESTModule, ProductRESTModule]

@Module({
  providers: [HTTPLoggingAppInterceptorDI.provider, CORSAppGuardDI.provider],
  imports: [HTTPLoggingInterceptorModule, CORSGuardModule, ...restModules],
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
