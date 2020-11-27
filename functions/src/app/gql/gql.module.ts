import { CORSAppGuardDI, CORSMiddleware, HTTPLoggingAppInterceptorDI } from '../nest'
import { CORSServiceModule, LoggingServiceModule } from '../services'
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import CartGQLModule from './cart'
import DevUtilsGQLModule from './dev'
import EnvGQLModule from './env'
import { GraphQLModule } from '@nestjs/graphql'
import KeepAliveGQLModule from './keepalive'
import ProductGQLModule from './product'
import StorageGQLModule from './storage'
import UserGQLModule from './user'
import { config } from '../../config'
import { getGQLModuleOptions } from './base'

//========================================================================
//
//  Implementation
//
//========================================================================

const gqlOptions = getGQLModuleOptions([config.gql.schema.moduleDir])

const gqlModules = [EnvGQLModule, StorageGQLModule, UserGQLModule, KeepAliveGQLModule, CartGQLModule, ProductGQLModule]
if (process.env.NODE_ENV !== 'production') {
  gqlModules.push(DevUtilsGQLModule)
}

@Module({
  providers: [HTTPLoggingAppInterceptorDI.provider, CORSAppGuardDI.provider],
  imports: [LoggingServiceModule, CORSServiceModule, GraphQLModule.forRoot(gqlOptions), ...gqlModules],
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
