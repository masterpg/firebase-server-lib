import * as _path from 'path'
import { CORSAppGuardDI, CORSMiddleware, HTTPLoggingAppInterceptorDI } from '../nest'
import { DateTimeScalar, LongScalar, getCodeFirstGQLModuleOptions } from './base'
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import { CORSServiceModule } from '../services'
import { DevUtilsGQLModule } from './dev'
import { EnvGQLModule } from './env'
import { ExampleShopGQLModule } from './example/shop'
import { GraphQLModule } from '@nestjs/graphql'
import { KeepAliveGQLModule } from './keepalive'
import { LoggingServiceModule } from '../services/base/logging'
import { StorageGQLModule } from './storage'
import { UserGQLModule } from './user'

//========================================================================
//
//  Implementation
//
//========================================================================

const gqlOptions = getCodeFirstGQLModuleOptions({
  autoSchemaFile: _path.join(process.cwd(), 'src/app/gql/schema.graphql'),
})

const gqlModules = [EnvGQLModule, UserGQLModule, StorageGQLModule, KeepAliveGQLModule, ExampleShopGQLModule]
if (process.env.NODE_ENV !== 'production') {
  gqlModules.push(DevUtilsGQLModule)
}

@Module({
  providers: [HTTPLoggingAppInterceptorDI.provider, CORSAppGuardDI.provider, DateTimeScalar, LongScalar],
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
