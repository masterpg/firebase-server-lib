import { AuthServiceDI, CORSGuardDI, CORSMiddleware, CORSServiceDI, FirestoreServiceDI, LoggingInterceptorDI, LoggingServiceDI } from '../lib'
import { Global, MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import { GQLContainerModule } from './gql'
import { RESTContainerModule } from './rest'

@Global()
@Module({
  providers: [
    CORSServiceDI.provider,
    AuthServiceDI.provider,
    LoggingServiceDI.provider,
    CORSGuardDI.provider,
    FirestoreServiceDI.provider,
    LoggingInterceptorDI.provider,
  ],
  exports: [CORSServiceDI.provider, AuthServiceDI.provider, LoggingServiceDI.provider, FirestoreServiceDI.provider],
})
class AppBaseModule {}

@Module({
  imports: [AppBaseModule, GQLContainerModule, RESTContainerModule],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}
