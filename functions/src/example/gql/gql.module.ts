import { CORSAppGuardDI, CORSGuardModule, CORSMiddleware, HttpLoggingAppInterceptorDI, HttpLoggingInterceptorModule } from '../../lib/nest'
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import CartGQLModule from './cart'
import DevUtilsGQLModule from './dev'
import FoundationGQLModule from './foundation'
import { GraphQLModule } from '@nestjs/graphql'
import ProductGQLModule from './product'
import StorageGQLModule from './storage'
import { config } from '../../config'
import { getGQLModuleOptions } from './base'

const gqlOptions = getGQLModuleOptions([config.gql.schema.moduleDir])

const gqlModules = [FoundationGQLModule, StorageGQLModule, CartGQLModule, ProductGQLModule]
if (process.env.NODE_ENV !== 'production') {
  gqlModules.push(DevUtilsGQLModule)
}

@Module({
  providers: [HttpLoggingAppInterceptorDI.provider, CORSAppGuardDI.provider],
  imports: [HttpLoggingInterceptorModule, CORSGuardModule, GraphQLModule.forRoot(gqlOptions), ...gqlModules],
})
export default class GQLContainerModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}
