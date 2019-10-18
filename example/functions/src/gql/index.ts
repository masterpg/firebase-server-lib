import { DateTimeScalar, getGqlModuleBaseOptions } from 'web-server-lib'
import { GqlModuleOptions, GraphQLModule } from '@nestjs/graphql'
import { GQLAppModule } from './modules/app'
import { GQLCartModule } from './modules/cart'
import { GQLProductModule } from './modules/product'
import { GQLStorageModule } from './modules/storage'
import { GQLTestModule } from './modules/test'
import { Module } from '@nestjs/common'
const merge = require('lodash/merge')

const gqlOptions: GqlModuleOptions = {
  ...getGqlModuleBaseOptions('lib/gql/modules'),
  path: '/gql',
}

const imports: any[] = [GQLAppModule, GQLProductModule, GQLCartModule, GQLStorageModule]

if (process.env.NODE_ENV !== 'production') {
  merge(gqlOptions, {
    debug: true,
    playground: true,
    introspection: true,
  })
  imports.push(GQLTestModule)
}

@Module({
  providers: [DateTimeScalar],
  imports: [GraphQLModule.forRoot(gqlOptions), ...imports],
})
export class GQLContainerModule {}
