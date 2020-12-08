import * as _path from 'path'
import { BaseGQLContainerModule, getSchemaFirstGQLModuleOptions } from '../base'
import { ExampleShopGQLModule } from './shop'
import { GraphQLModule } from '@nestjs/graphql'
import { Module } from '@nestjs/common'
import { config } from '../../../config'

//========================================================================
//
//  Implementation
//
//========================================================================

// `functions`ディレクトリからみたパスを指定
const gqlOptions = getSchemaFirstGQLModuleOptions([_path.join(config.functions.buildDir, 'app/gql/example/index.graphql')])

const gqlModules = [ExampleShopGQLModule]

@Module({
  imports: [BaseGQLContainerModule, GraphQLModule.forRoot(gqlOptions), ...gqlModules],
})
class ExampleGQLContainerModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export default ExampleGQLContainerModule
