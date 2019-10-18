import * as chokidar from 'chokidar'
import * as fs from 'fs'
import * as glob from 'glob'
import * as path from 'path'
import { Context, ContextFunction } from 'apollo-server-core'
import { loadSchemaFiles, mergeTypeDefs } from 'graphql-toolkit'
import { GQLContext } from '../nest'
import { GraphQLDefinitionsFactory } from '@nestjs/graphql'
import GraphQLJSON from 'graphql-type-json'
import { IResolvers } from 'graphql-tools'
import { print } from 'graphql/language/printer'
import { removeBothEndsSlash } from 'web-base-lib'

function removeExtraPart(path: string) {
  path = path.replace(/^\./, '')
  return removeBothEndsSlash(path)
}

/**
 * 指定されたパス配下にある`.graphql`ファイルをもとに、
 * TypeScript用のGraphQL定義ファイルを生成します。
 * 生成されるファイル名は`gql.schema.ts`になります。
 *
 * @param srcPath `.graphql`ファイルが配置されているパスを指定。
 * @param outPath 生成されるTypeScript用のGraphQL定義ファイルを配置するパス
 * @param watch
 */
export function generateSchema(srcPath: string, outPath: string, watch?: boolean): void {
  srcPath = removeExtraPart(srcPath)
  outPath = removeExtraPart(outPath)

  const definitionsFactory = new GraphQLDefinitionsFactory()
  definitionsFactory.generate({
    typePaths: [path.resolve(process.cwd(), `${srcPath}/**/*.graphql`)],
    path: path.resolve(process.cwd(), `${outPath}/gql.schema.ts`),
    outputAs: 'interface',
    watch: !!watch,
  })
}

/**
 * GraphQLの定義ファイルの処理を行います。
 * このメソッドでは次の処理が行われます。
 * + `srcPath`配下にある`.graphql`ファイルを`outPath`へコピー。
 * + `srcPath`配下にある`.graphql`ファイルをもとに、TypeScript用のGraphQL定義ファイルとなる`gql.schema.ts`を`srcPath`直下に生成。
 *
 * @param srcPath .graphqlファイルが配置されているパスを指定。またこのパス直下にTypeScript用のGraphQL定義ファイルとなる`gql.schema.ts`が生成される。
 * @param outPath .graphqlファイルのコピー先パスを指定。
 * @param watch
 */
export function setupSchema(srcPath: string, outPath: string, watch?: boolean): void {
  srcPath = removeExtraPart(srcPath)
  outPath = removeExtraPart(outPath)

  // "src"配下の"*.graphql"ファイルの一覧を取得
  const graphqlFiles = glob.sync(path.resolve(process.cwd(), `${srcPath}/**/*.graphql`))
  for (const srcFilePath of graphqlFiles) {
    // "src"ベースのパスを"out"ベースへ置き換え
    // 例: src/gql/modules/product/product.graphql → lib/gql/modules/product/product.graphql
    const srcReg = new RegExp(`/?(${srcPath})/`)
    const outFilePath = srcFilePath.replace(srcReg, (match: string, $1: string, offset: number) => {
      return match.replace($1, outPath)
    })
    // "src"から"out"へ".graphql"ファイルをコピー
    fs.mkdirSync(path.dirname(outFilePath), { recursive: true })
    fs.copyFileSync(srcFilePath, outFilePath)
    if (!watch) continue

    // "src"配下の".graphql"ファイルに変更があった場合、
    // "src"から"lib"へ".graphql"ファイルをコピー
    chokidar.watch(srcFilePath, { persistent: true }).on('change', (path: string) => {
      fs.copyFileSync(srcFilePath, outFilePath)
    })
  }

  // GraphQLの定義からTypeScriptの型定義を作成
  generateSchema(srcPath, srcPath, watch)
}

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
