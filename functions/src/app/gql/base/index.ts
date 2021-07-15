import * as _path from 'path'
import {
  APIMiddleware,
  AuthMiddleware,
  CORSAppGuardDI,
  CORSMiddleware,
  DateTimeScalar,
  GQLContext,
  HTTPLoggingAppInterceptorDI,
  LongScalar,
} from '../../nest'
import { AuthServiceModule, CORSServiceModule, LoggingServiceModule } from '../../services'
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import { loadSchemaFiles, mergeTypeDefs } from 'graphql-toolkit'
import { GqlModuleOptions } from '@nestjs/graphql'
import { config } from '../../../config'
import { merge } from 'lodash'
import { print } from 'graphql/language/printer'

//========================================================================
//
//  Implementation
//
//========================================================================

/**
 * 指定されたパス配下にある`.graphql`ファイルを走査し、
 * 見つかったファイルをマージしてGraphQL定義文字列を取得します。
 * @param schemaFilesOrDirs `.graphql`ファイルまたはファイルが配置されているディレクトリ
 */
function getTypeDefs(schemaFilesOrDirs: string[]): string {
  const typeDefs: string[] = []
  for (const schemaFileOrDir of schemaFilesOrDirs) {
    typeDefs.push(...loadSchemaFiles(schemaFileOrDir))
  }
  return print(mergeTypeDefs(typeDefs))
}

/**
 * GraphQLのコーディングをベースにGraphQLの起動オプションを取得します。
 * @param params
 */
function getCodeFirstGQLModuleOptions(params: { autoSchemaFile: string | boolean }): GqlModuleOptions {
  const result: GqlModuleOptions = {
    path: '/',
    autoSchemaFile: params.autoSchemaFile,
    context: async (ctx: any) => {
      return ctx as GQLContext
    },
    sortSchema: false,
  }
  if (config.env.mode !== 'prod') {
    merge(result, {
      debug: true,
      playground: true,
      introspection: true,
    })
  }
  return result
}

/**
 * GraphQLのスキーマ定義をベースにGraphQLの起動オプションを取得します。
 * @param schemaFilesOrDirs
 *   GraphQLのスキーマが定義されているファイルまたはディレクトリを指定します。
 *   例: ['dist/app/gql/standard', 'dist/app/gql/aaa.graphql']
 */
function getSchemaFirstGQLModuleOptions(schemaFilesOrDirs: string[] = []): GqlModuleOptions {
  // GraphQLのベーススキーマ定義ファイルを追加
  schemaFilesOrDirs.push(_path.join(config.env.buildDir, 'app/gql/base.graphql'))

  const result: GqlModuleOptions = {
    path: '/',
    typeDefs: getTypeDefs(schemaFilesOrDirs),
    context: async (ctx: any) => {
      return ctx as GQLContext
    },
    resolverValidationOptions: {
      // GraphQLの定義でインタフェースを使用した場合、プログラムでリゾルバを実装しないと警告がでる事象についての対応。
      // この設定値について:
      //   https://github.com/Urigo/graphql-tools/blob/master/docs/source/generate-schema.md
      // リゾルバについて:
      //   https://www.apollographql.com/docs/apollo-server/schema/unions-interfaces/#interface-type
      requireResolversForResolveType: false,
    },
  }
  if (config.env.mode !== 'prod') {
    merge(result, {
      debug: true,
      playground: true,
      introspection: true,
    })
  }
  return result
}

@Module({
  providers: [HTTPLoggingAppInterceptorDI.provider, CORSAppGuardDI.provider, DateTimeScalar, LongScalar],
  imports: [LoggingServiceModule, CORSServiceModule, AuthServiceModule],
})
class BaseGQLContainerModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
    consumer.apply(AuthMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
    consumer.apply(APIMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export { getCodeFirstGQLModuleOptions, getSchemaFirstGQLModuleOptions, BaseGQLContainerModule }
export * from '../../nest/decorators/gql-context-arg'
export * from '../../nest/scalars/date-time'
export * from '../../nest/scalars/long'
export * from './keepalive'
