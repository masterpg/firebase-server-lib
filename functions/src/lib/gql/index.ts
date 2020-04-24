import * as path from 'path'
import { Context, ContextFunction } from 'apollo-server-core'
import { IResolverValidationOptions, IResolvers } from 'graphql-tools'
import { loadSchemaFiles, mergeTypeDefs } from 'graphql-toolkit'
import { GQLContext } from '../nest'
import GraphQLJSON from 'graphql-type-json'
import { print } from 'graphql/language/printer'

/**
 * 指定されたパス配下にある`.graphql`ファイルを走査し、
 * 見つかったファイルをマージしてGraphQL定義文字列を取得します。
 * @param schemaFilesOrDirs `.graphql`ファイルまたはファイルが配置されているディレクトリ
 */
export function getTypeDefs(schemaFilesOrDirs: string[]): string {
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
export function getBaseGQLModuleOptions(
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

export * from './decorators/context'
export * from './scalars/date-time'
