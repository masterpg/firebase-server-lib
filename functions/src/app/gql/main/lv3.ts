import * as _path from 'path'
import { BaseGQLContainerModule, KeepAliveGQLModule, getSchemaFirstGQLModuleOptions } from '../base'
import { MoveStorageDirGQLModule, RemoveStorageDirGQLModule, RenameStorageDirGQLModule } from './storage'
import { GraphQLModule } from '@nestjs/graphql'
import { Module } from '@nestjs/common'
import { config } from '../../../config'

//========================================================================
//
//  Implementation
//
//========================================================================

const gqlOptions = getSchemaFirstGQLModuleOptions([
  _path.join(config.env.buildDir, 'app/gql/dto.graphql'),
  _path.join(config.env.buildDir, 'app/gql/main/lv3.graphql'),
  _path.join(config.env.buildDir, 'app/gql/base/keepalive'),
])

const gqlModules = [RemoveStorageDirGQLModule, MoveStorageDirGQLModule, RenameStorageDirGQLModule, KeepAliveGQLModule]

@Module({
  imports: [BaseGQLContainerModule, GraphQLModule.forRoot(gqlOptions), ...gqlModules],
})
class Lv3GQLContainerModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export default Lv3GQLContainerModule
