import { AppServiceDI, CartServiceDI, HandlersServiceDI, ProductServiceDI, StorageServiceDI } from './services'
import { CORSGuardDI, CORSMiddleware, LoggingInterceptorDI, libBaseProviders } from '../lib'
import { Global, MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import { GQLContainerModule } from './gql'
import { RESTContainerModule } from './rest'

@Global()
@Module({
  providers: [
    ...libBaseProviders,
    AppServiceDI.provider,
    StorageServiceDI.provider,
    HandlersServiceDI.provider,
    ProductServiceDI.provider,
    CartServiceDI.provider,
  ],
  exports: [
    ...libBaseProviders,
    AppServiceDI.provider,
    StorageServiceDI.provider,
    HandlersServiceDI.provider,
    ProductServiceDI.provider,
    CartServiceDI.provider,
  ],
})
export class AppBaseModule {}

@Module({
  providers: [CORSGuardDI.provider, LoggingInterceptorDI.provider],
  imports: [AppBaseModule, GQLContainerModule, RESTContainerModule],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}
