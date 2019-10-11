import * as path from 'path'
import { GqlModuleOptions, GraphQLModule } from '@nestjs/graphql'
import { loadSchemaFiles, mergeTypeDefs } from 'graphql-toolkit'
import { GQLAppModule } from './modules/app'
import { GQLCartModule } from './modules/cart'
import { GQLContext } from '../nest'
import { GQLProductModule } from './modules/product'
import { GQLStorageModule } from './modules/storage'
import { GQLTestModule } from './modules/test'
import GraphQLJSON from 'graphql-type-json'
import { Module } from '@nestjs/common'
import { print } from 'graphql/language/printer'
const merge = require('lodash/merge')

// import 'graphql-import-node'
// const typeDefs: string[] = []
// typeDefs.push(print(require('./modules/product/product.graphql')))

const imports: any[] = [GQLAppModule, GQLProductModule, GQLCartModule, GQLStorageModule]

const targetPath = path.join(process.cwd(), 'lib/gql/modules')
const typeDefs = print(mergeTypeDefs(loadSchemaFiles(targetPath)))

const gqlOptions: GqlModuleOptions = {
  context: async ({ req, res }) => {
    return { req, res } as GQLContext
  },
  typeDefs,
  path: '/gql',
  resolvers: { JSON: GraphQLJSON },
}

if (process.env.NODE_ENV !== 'production') {
  merge(gqlOptions, {
    debug: true,
    playground: true,
    introspection: true,
  })
  imports.push(GQLTestModule)
}

@Module({
  imports: [GraphQLModule.forRoot(gqlOptions), ...imports],
})
export class GQLContainerModule {}
