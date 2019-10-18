import { Context, ContextFunction } from 'apollo-server-core';
import { IResolvers } from 'graphql-tools';
/**
 * 指定されたパス配下にある`.graphql`ファイルをもとに、
 * TypeScript用のGraphQL定義ファイルを生成します。
 * 生成されるファイル名は`gql.schema.ts`になります。
 *
 * @param srcPath `.graphql`ファイルが配置されているパスを指定。
 * @param outPath 生成されるTypeScript用のGraphQL定義ファイルを配置するパス
 * @param watch
 */
export declare function generateSchema(srcPath: string, outPath: string, watch?: boolean): void;
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
export declare function setupSchema(srcPath: string, outPath: string, watch?: boolean): void;
/**
 * 指定されたパス配下にある`.graphql`ファイルを走査し、
 * 見つかったファイルをマージしてGraphQL定義文字列を取得します。
 * @param scanPath `.graphql`ファイルが配置されているパス
 */
export declare function getTypeDefs(scanPath: string): string;
/**
 * `@nestjs/graphql`の`GqlModuleOptions`のベースを取得します。
 * @param scanPath `.graphql`ファイルが配置されているパス
 */
export declare function getGqlModuleBaseOptions(scanPath: string): {
    context: Context | ContextFunction;
    typeDefs: string;
    resolvers: IResolvers | Array<IResolvers>;
};
export * from './decorators/context';
export * from './scalars/date-time';
