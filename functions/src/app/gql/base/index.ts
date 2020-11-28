import * as path from 'path'
import { Context, ContextFunction } from 'apollo-server-core'
import { IResolverValidationOptions, IResolvers } from '@kamilkisiela/graphql-tools'
import { loadSchemaFiles, mergeTypeDefs } from 'graphql-toolkit'
import { DateTimeScalar } from './scalars/date-time'
import { GQLContext } from './base'
import { GqlModuleOptions } from '@nestjs/graphql'
import GraphQLJSON from 'graphql-type-json'
import { LongScalar } from './scalars/long'
import { Module } from '@nestjs/common'
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
    const targetPath = path.resolve(process.cwd(), schemaFileOrDir)
    typeDefs.push(...loadSchemaFiles(targetPath))
  }
  return print(mergeTypeDefs(typeDefs))
}

/**
 * `@nestjs/graphql`の`GqlModuleOptions`のベースを取得します。
 * @param schemaFilesOrDirs `.graphql`ファイルまたはファイルが配置されているディレクトリ
 */
function getBaseGQLModuleOptions(
  schemaFilesOrDirs: string[]
): {
  context: Context | ContextFunction
  typeDefs: string
  resolvers: IResolvers | Array<IResolvers>
  resolverValidationOptions?: IResolverValidationOptions
} {
  return {
    context: async (ctx: any) => {
      const { req, res } = ctx
      return { req, res } as GQLContext
    },
    typeDefs: getTypeDefs(schemaFilesOrDirs),
    resolvers: { JSON: GraphQLJSON },
    resolverValidationOptions: {
      // GraphQLの定義でインタフェースを使用した場合、プログラムでリゾルバを実装しないと警告がでる事象についての対応。
      // この設定値について:
      //   https://github.com/Urigo/graphql-tools/blob/master/docs/source/generate-schema.md
      // リゾルバについて:
      //   https://www.apollographql.com/docs/apollo-server/schema/unions-interfaces/#interface-type
      requireResolversForResolveType: false,
    },
  }
}

function getGQLModuleOptions(): GqlModuleOptions {
  const result: GqlModuleOptions = {
    ...getBaseGQLModuleOptions(config.gql.schemaFilesOrDirs),
    path: '/',
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
  providers: [DateTimeScalar, LongScalar],
})
export class BaseGQLModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { getBaseGQLModuleOptions, getGQLModuleOptions }
export * from './base'
export * from './decorators/context'
export * from './scalars/date-time'
export * from './scalars/long'
