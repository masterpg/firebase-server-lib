import { CORSAppGuardDI, CORSGuardModule, CORSMiddleware, HttpLoggingAppInterceptorDI, HttpLoggingInterceptorModule } from '../../lib'
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'

@Module({
  providers: [HttpLoggingAppInterceptorDI.provider, CORSAppGuardDI.provider],
  imports: [HttpLoggingInterceptorModule, CORSGuardModule],
})
export class BaseRESTModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}
