import { CORSMiddleware, CORSServiceDI, FirestoreServiceDI, LoggingInterceptorDI, LoggingServiceDI } from '../../src/lib'
import { Global, MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'

@Global()
@Module({
  providers: [LoggingServiceDI.provider, FirestoreServiceDI.provider, LoggingInterceptorDI.provider],
  exports: [LoggingServiceDI.provider, FirestoreServiceDI.provider],
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
