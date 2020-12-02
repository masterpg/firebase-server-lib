const { GraphQLDefinitionsFactory } = require('@nestjs/graphql')
const chokidar = require('chokidar')
const fs = require('fs')
const glob = require('glob')
const _path = require('path')
const { program } = require('commander')
const { removeBothEndsSlash } = require('web-base-lib')

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
function generateSchema(scanDir, outDir, watch) {
  scanDir = removeExtraPart(scanDir)
  outDir = removeExtraPart(outDir)

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
function buildSchema(scanDir, copyDir, watch) {
  scanDir = removeExtraPart(scanDir)
  copyDir = removeExtraPart(copyDir)

  // `scanDir`配下の`*.graphql`ファイルの一覧を取得
  const graphqlFiles = glob.sync(_path.resolve(process.cwd(), `${scanDir}/**/*.graphql`))
  for (const graphqlFile of graphqlFiles) {
    // `scanDir`ベースのパスを`copyDir`ベースへ置き換え
    // 例: src/gql/modules/product/product.graphql → dist/gql/modules/product/product.graphql
    const srcReg = new RegExp(`/?(${scanDir})/`)
    const copyGraphqlFile = graphqlFile.replace(srcReg, (match, $1, offset) => {
      return match.replace($1, copyDir)
    })
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

function removeExtraPart(path) {
  path = path.replace(/^\./, '')
  return removeBothEndsSlash(path)
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
