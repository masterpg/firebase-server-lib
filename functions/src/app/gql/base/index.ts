import * as _path from 'path'
import { CORSAppGuardDI, CORSMiddleware, HTTPLoggingAppInterceptorDI } from '../../nest'
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import { loadSchemaFiles, mergeTypeDefs } from 'graphql-toolkit'
import { CORSServiceModule } from '../../services'
import { DateTimeScalar } from './scalars/date-time'
import { GQLContext } from './base'
import { GqlModuleOptions } from '@nestjs/graphql'
import { LoggingServiceModule } from '../../services/base/logging'
import { LongScalar } from './scalars/long'
import { config } from '../../../config'
import { isDevelopment } from '../../base'
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
    const targetPath = _path.resolve(process.cwd(), schemaFileOrDir)
    typeDefs.push(...loadSchemaFiles(targetPath))
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
  if (isDevelopment()) {
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
  schemaFilesOrDirs.push(_path.join(config.functions.buildDir, 'app/gql/base.graphql'))

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
  if (isDevelopment()) {
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
  imports: [LoggingServiceModule, CORSServiceModule],
})
class BaseGQLContainerModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export { getCodeFirstGQLModuleOptions, getSchemaFirstGQLModuleOptions, BaseGQLContainerModule }
export * from './base'
export * from './decorators/context'
export * from './scalars/date-time'
export * from './scalars/long'
export * from './keepalive'
