"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
const chokidar = require("chokidar");
const fs = require("fs");
const glob = require("glob");
const path = require("path");
const graphql_toolkit_1 = require("graphql-toolkit");
const graphql_1 = require("@nestjs/graphql");
const graphql_type_json_1 = require("graphql-type-json");
const printer_1 = require("graphql/language/printer");
const web_base_lib_1 = require("web-base-lib");
function removeExtraPart(path) {
    path = path.replace(/^\./, '');
    return web_base_lib_1.removeBothEndsSlash(path);
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
function generateSchema(srcPath, outPath, watch) {
    srcPath = removeExtraPart(srcPath);
    outPath = removeExtraPart(outPath);
    const definitionsFactory = new graphql_1.GraphQLDefinitionsFactory();
    definitionsFactory.generate({
        typePaths: [path.resolve(process.cwd(), `${srcPath}/**/*.graphql`)],
        path: path.resolve(process.cwd(), `${outPath}/gql.schema.ts`),
        outputAs: 'interface',
        watch: !!watch,
    });
}
exports.generateSchema = generateSchema;
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
function setupSchema(srcPath, outPath, watch) {
    srcPath = removeExtraPart(srcPath);
    outPath = removeExtraPart(outPath);
    // "src"配下の"*.graphql"ファイルの一覧を取得
    const graphqlFiles = glob.sync(path.resolve(process.cwd(), `${srcPath}/**/*.graphql`));
    for (const srcFilePath of graphqlFiles) {
        // "src"ベースのパスを"out"ベースへ置き換え
        // 例: src/gql/modules/product/product.graphql → lib/gql/modules/product/product.graphql
        const srcReg = new RegExp(`/?(${srcPath})/`);
        const outFilePath = srcFilePath.replace(srcReg, (match, $1, offset) => {
            return match.replace($1, outPath);
        });
        // "src"から"out"へ".graphql"ファイルをコピー
        fs.mkdirSync(path.dirname(outFilePath), { recursive: true });
        fs.copyFileSync(srcFilePath, outFilePath);
        if (!watch)
            continue;
        // "src"配下の".graphql"ファイルに変更があった場合、
        // "src"から"lib"へ".graphql"ファイルをコピー
        chokidar.watch(srcFilePath, { persistent: true }).on('change', (path) => {
            fs.copyFileSync(srcFilePath, outFilePath);
        });
    }
    // GraphQLの定義からTypeScriptの型定義を作成
    generateSchema(srcPath, srcPath, watch);
}
exports.setupSchema = setupSchema;
/**
 * 指定されたパス配下にある`.graphql`ファイルを走査し、
 * 見つかったファイルをマージしてGraphQL定義文字列を取得します。
 * @param scanPath `.graphql`ファイルが配置されているパス
 */
function getTypeDefs(scanPath) {
    const targetPath = path.resolve(process.cwd(), scanPath);
    return printer_1.print(graphql_toolkit_1.mergeTypeDefs(graphql_toolkit_1.loadSchemaFiles(targetPath)));
}
exports.getTypeDefs = getTypeDefs;
/**
 * `@nestjs/graphql`の`GqlModuleOptions`のベースを取得します。
 * @param scanPath `.graphql`ファイルが配置されているパス
 */
function getGqlModuleBaseOptions(scanPath) {
    return {
        context: async (ctx) => {
            const { req, res } = ctx;
            return { req, res };
        },
        typeDefs: getTypeDefs(scanPath),
        resolvers: { JSON: graphql_type_json_1.default },
    };
}
exports.getGqlModuleBaseOptions = getGqlModuleBaseOptions;
__export(require("./decorators/context"));
//# sourceMappingURL=index.js.map