import * as _path from 'path'
import * as chokidar from 'chokidar'
import * as fs from 'fs'
import * as program from 'commander'
import { GraphQLDefinitionsFactory } from '@nestjs/graphql'
import { glob } from 'glob'
import { removeBothEndsSlash } from 'web-base-lib'

//========================================================================
//
//  Implementation
//
//========================================================================

/**
 * 指定されたパス配下にある`.graphql`ファイルをもとに、
 * TypeScript用のGraphQL定義ファイルを生成します。
 * 生成されるファイル名は`gql.schema.ts`になります。
 *
 * @param scanDir `.graphql`ファイルが配置されているディレクトリを指定。
 * @param outDir TypeScript用GraphQL定義ファイルの出力ディレクトリを指定。
 * @param watch
 */
function generateSchema(scanDir: string, outDir: string, watch: string): void {
  scanDir = _path.resolve(removeBothEndsSlash(scanDir))
  outDir = _path.resolve(removeBothEndsSlash(outDir))

  const definitionsFactory = new GraphQLDefinitionsFactory()
  definitionsFactory.generate({
    typePaths: [_path.resolve(process.cwd(), `${scanDir}/**/*.graphql`)],
    path: _path.resolve(process.cwd(), `${outDir}/gql.schema.ts`),
    outputAs: 'interface',
    watch: !!watch,
  })
}

/**
 * GraphQL定義ファイルの構築を行います。
 * このメソッドでは`scanDir`配下にある`.graphql`ファイルを`copyDir`へコピーします。
 *
 * @param scanDir .graphqlファイルが配置されているディレクトリを指定。
 * @param copyDir .graphqlファイルのコピー先ディレクトリを指定。
 * @param watch
 */
function buildSchema(scanDir: string, copyDir: string, watch?: boolean) {
  scanDir = _path.resolve(removeBothEndsSlash(scanDir))
  copyDir = _path.resolve(removeBothEndsSlash(copyDir))
  const scanBaseName = _path.basename(scanDir)

  // `scanDir`配下の`*.graphql`ファイルの一覧を取得
  const graphqlFiles = glob.sync(_path.join(scanDir, `**/*.graphql`))
  for (const graphqlFile of graphqlFiles) {
    // `scanDir`ベースのパスを`copyDir`ベースへ置き換え
    // 例: src/gql/main/lv1.graphql → dist/gql/main/lv1.graphql
    const srcReg = new RegExp(`/?(${scanBaseName})/`)
    const srcRegExecArray = srcReg.exec(graphqlFile)!
    const match = srcRegExecArray[0] // 例: '/src/'
    const index = srcRegExecArray.index
    const relativeFile = graphqlFile.substr(index + match.length) // 例: 'gql/main/lv1.graphql'
    const copyGraphqlFile = _path.join(copyDir, relativeFile)

    // `scanDir`から`copyDir`へ`.graphql`ファイルをコピー
    fs.mkdirSync(_path.dirname(copyGraphqlFile), { recursive: true })
    fs.copyFileSync(graphqlFile, copyGraphqlFile)
    if (!watch) continue

    // `scanDir`配下の`.graphql`ファイルに変更があった場合、
    // `scanDir`から`copyDir`へ`.graphql`ファイルをコピー
    chokidar.watch(graphqlFile, { persistent: true }).on('change', path => {
      fs.copyFileSync(graphqlFile, copyGraphqlFile)
    })
  }
}

//========================================================================
//
//  Commands
//
//========================================================================

program
  .command('generate <srcPath> <outPath>')
  .description(`generate TypeScript definition file based on '.graphql' files`)
  .option('-w, --watch', `watch '.graphql' files changes`)
  .action((srcPath, outPath, cmdObj) => {
    generateSchema(srcPath, outPath, cmdObj.watch)
  })

program
  .command('build <srcPath> <copyDir>')
  .description(`build a GraphQL definition file`)
  .option('-w, --watch', `watch '.graphql' files changes`)
  .action((srcPath, copyDir, cmdObj) => {
    buildSchema(srcPath, copyDir, cmdObj.watch)
  })

program.parse(process.argv)
