import { CORSAppGuardDI, CORSGuardModule, CORSMiddleware, HTTPLoggingAppInterceptorDI, HTTPLoggingInterceptorModule } from '../../lib/nest'
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import CartGQLModule from './cart'
import DevUtilsGQLModule from './dev'
import FoundationGQLModule from './foundation'
import { GraphQLModule } from '@nestjs/graphql'
import ProductGQLModule from './product'
import StorageGQLModule from './storage'
import { UserServiceModule } from '../services'
import { config } from '../../config'
import { getGQLModuleOptions } from './base'

//========================================================================
//
//  Implementation
//
//========================================================================

const gqlOptions = getGQLModuleOptions([config.gql.schema.moduleDir])

const gqlModules = [FoundationGQLModule, StorageGQLModule, UserServiceModule, CartGQLModule, ProductGQLModule]
if (process.env.NODE_ENV !== 'production') {
  gqlModules.push(DevUtilsGQLModule)
}

@Module({
  providers: [HTTPLoggingAppInterceptorDI.provider, CORSAppGuardDI.provider],
  imports: [HTTPLoggingInterceptorModule, CORSGuardModule, GraphQLModule.forRoot(gqlOptions), ...gqlModules],
})
class GQLContainerModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export default GQLContainerModule
