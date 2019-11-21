import { CORSMiddleware, CORSServiceDI, FirestoreServiceDI, HttpLoggingServiceDI, LoggingInterceptorDI } from '../../../src/lib'
import { Global, MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'

@Global()
@Module({
  providers: [HttpLoggingServiceDI.provider, FirestoreServiceDI.provider, LoggingInterceptorDI.provider],
  exports: [HttpLoggingServiceDI.provider, FirestoreServiceDI.provider],
})
export class MockBaseAppModule {}

@Global()
@Module({
  providers: [CORSServiceDI.provider],
  exports: [CORSServiceDI.provider],
  imports: [MockBaseAppModule],
})
export class MockCORSBaseAppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}
