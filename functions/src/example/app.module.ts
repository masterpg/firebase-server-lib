import { CORSGuardDI, CORSMiddleware, LoggingInterceptorDI, libBaseProviders } from '../lib'
import { CartServiceDI, FoundationServiceDI, HandlersServiceDI, ProductServiceDI, StorageServiceDI } from './services'
import { Global, MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import { GQLContainerModule } from './gql'
import { RESTContainerModule } from './rest'

@Global()
@Module({
  providers: [
    ...libBaseProviders,
    FoundationServiceDI.provider,
    StorageServiceDI.provider,
    HandlersServiceDI.provider,
    ProductServiceDI.provider,
    CartServiceDI.provider,
  ],
  exports: [
    ...libBaseProviders,
    FoundationServiceDI.provider,
    StorageServiceDI.provider,
    HandlersServiceDI.provider,
    ProductServiceDI.provider,
    CartServiceDI.provider,
  ],
  imports: [GQLContainerModule, RESTContainerModule],
})
export class AppBaseModule {}

@Module({
  providers: [CORSGuardDI.provider, LoggingInterceptorDI.provider],
  imports: [AppBaseModule],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}
