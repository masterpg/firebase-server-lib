import { AuthServiceDI, CORSServiceDI, FirestoreServiceDI, LoggingServiceDI } from './services/base'
import { CORSGuardDI, CORSMiddleware } from './nest'
import { Global, MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import { GQLContainerModule } from './gql'
import { LoggingInterceptorDI } from './nest'
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
