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

const gqlOptions = getSchemaFirstGQLModuleOptions([
  _path.join(config.env.buildDir, 'app/gql/dto.graphql'),
  _path.join(config.env.buildDir, 'app/gql/main/lv1.graphql'),
  _path.join(config.env.buildDir, 'app/gql/base/keepalive'),
])

const gqlModules = [EnvGQLModule, UserGQLModule, StorageGQLModule, KeepAliveGQLModule]

@Module({
  imports: [BaseGQLContainerModule, GraphQLModule.forRoot(gqlOptions), ...gqlModules],
})
class Lv1GQLContainerModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export default Lv1GQLContainerModule
