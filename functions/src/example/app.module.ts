import { AppServiceDI, CartServiceDI, DevUtilsServiceDI, ProductServiceDI, StorageServiceDI } from './services'
import { CORSGuardDI, CORSMiddleware, LibBaseModule, LoggingInterceptorDI } from '../lib'
import { Global, MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import { GQLContainerModule } from './gql'
import { RESTContainerModule } from './rest'

@Global()
@Module({
  providers: [AppServiceDI.provider, StorageServiceDI.provider, DevUtilsServiceDI.provider, ProductServiceDI.provider, CartServiceDI.provider],
  exports: [AppServiceDI.provider, StorageServiceDI.provider, DevUtilsServiceDI.provider, ProductServiceDI.provider, CartServiceDI.provider],
  imports: [LibBaseModule],
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
