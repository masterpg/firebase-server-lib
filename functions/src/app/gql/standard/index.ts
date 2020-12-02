import * as _path from 'path'
import { BaseGQLContainerModule, KeepAliveGQLModule, getSchemaFirstGQLModuleOptions } from '../base'
import { EnvGQLModule } from './env'
import { GraphQLModule } from '@nestjs/graphql'
import { Module } from '@nestjs/common'
import { StorageGQLModule } from './storage'
import { UserGQLModule } from './user'
import { config } from '../../../config'

//========================================================================
//
//  Implementation
//
//========================================================================

// `functions`ディレクトリからみたパスを指定
const gqlOptions = getSchemaFirstGQLModuleOptions([
  _path.join(config.functions.buildDir, 'app/gql/dto.graphql'),
  _path.join(config.functions.buildDir, 'app/gql/standard'),
  _path.join(config.functions.buildDir, 'app/gql/base/keepalive'),
])

const gqlModules = [EnvGQLModule, UserGQLModule, StorageGQLModule, KeepAliveGQLModule]

@Module({
  imports: [BaseGQLContainerModule, GraphQLModule.forRoot(gqlOptions), ...gqlModules],
})
class StandardGQLContainerModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export default StandardGQLContainerModule
