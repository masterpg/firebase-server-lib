import { CORSAppGuardDI, CORSGuardModule, CORSMiddleware, HttpLoggingAppInterceptorDI, HttpLoggingInterceptorModule } from '../../lib/nest'
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import CartRESTModule from './cart'
import ProductRESTModule from './product'

const restModules = [CartRESTModule, ProductRESTModule]

@Module({
  providers: [HttpLoggingAppInterceptorDI.provider, CORSAppGuardDI.provider],
  imports: [HttpLoggingInterceptorModule, CORSGuardModule, ...restModules],
})
export default class RESTContainerModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}
