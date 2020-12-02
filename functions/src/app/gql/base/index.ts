import * as _path from 'path'
import { loadSchemaFiles, mergeTypeDefs } from 'graphql-toolkit'
import { GQLContext } from './base'
import { GqlModuleOptions } from '@nestjs/graphql'
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

function getSchemaFirstGQLModuleOptions(): GqlModuleOptions {
  const result: GqlModuleOptions = {
    typeDefs: getTypeDefs(config.gql.schemaFilesOrDirs),
    path: '/',
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

//========================================================================
//
//  Exports
//
//========================================================================

export { getCodeFirstGQLModuleOptions, getSchemaFirstGQLModuleOptions }
export * from './base'
export * from './decorators/context'
export * from './scalars/date-time'
export * from './scalars/long'
