import * as path from 'path'
import { Context, ContextFunction } from 'apollo-server-core'
import { loadSchemaFiles, mergeTypeDefs } from 'graphql-toolkit'
import { GQLContext } from '../nest'
import GraphQLJSON from 'graphql-type-json'
import { IResolvers } from 'graphql-tools'
import { print } from 'graphql/language/printer'

/**
 * 指定されたパス配下にある`.graphql`ファイルを走査し、
 * 見つかったファイルをマージしてGraphQL定義文字列を取得します。
 * @param scanPath `.graphql`ファイルが配置されているパス
 */
export function getTypeDefs(scanPath: string): string {
  const targetPath = path.resolve(process.cwd(), scanPath)
  return print(mergeTypeDefs(loadSchemaFiles(targetPath)))
}

/**
 * `@nestjs/graphql`の`GqlModuleOptions`のベースを取得します。
 * @param scanPath `.graphql`ファイルが配置されているパス
 */
export function getGqlModuleBaseOptions(
  scanPath: string
): {
  context: Context | ContextFunction
  typeDefs: string
  resolvers: IResolvers | Array<IResolvers>
} {
  return {
    context: async (ctx: any) => {
      const { req, res } = ctx
      return { req, res } as GQLContext
    },
    typeDefs: getTypeDefs(scanPath),
    resolvers: { JSON: GraphQLJSON },
  }
}

export * from './decorators/context'
export * from './scalars/date-time'
