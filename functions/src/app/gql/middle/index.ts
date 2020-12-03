import * as _path from 'path'
import { CORSAppGuardDI, CORSMiddleware, HTTPLoggingAppInterceptorDI } from '../../nest'
import { DateTimeScalar, KeepAliveGQLModule, LongScalar, getSchemaFirstGQLModuleOptions } from '../base'
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import { CORSServiceModule } from '../../services'
import { GraphQLModule } from '@nestjs/graphql'
import { LoggingServiceModule } from '../../services/base/logging'
import { MiddleStorageGQLModule } from './storage'
import { config } from '../../../config'

//========================================================================
//
//  Implementation
//
//========================================================================

// `functions`ディレクトリからみたパスを指定
const gqlOptions = getSchemaFirstGQLModuleOptions([
  _path.join(config.functions.buildDir, 'app/gql/dto.graphql'),
  _path.join(config.functions.buildDir, 'app/gql/middle'),
  _path.join(config.functions.buildDir, 'app/gql/base/keepalive'),
])

const gqlModules = [MiddleStorageGQLModule, KeepAliveGQLModule]

@Module({
  providers: [HTTPLoggingAppInterceptorDI.provider, CORSAppGuardDI.provider, DateTimeScalar, LongScalar],
  imports: [LoggingServiceModule, CORSServiceModule, GraphQLModule.forRoot(gqlOptions), ...gqlModules],
})
class MiddleGQLContainerModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export default MiddleGQLContainerModule
