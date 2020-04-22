import { DateTimeScalar, getGqlModuleBaseOptions } from '../../lib'
import { GqlModuleOptions, GraphQLModule } from '@nestjs/graphql'
import { GQLCartModule } from './cart'
import { GQLDevUtilsModule } from './dev'
import { GQLFoundationModule } from './foundation'
import { GQLProductModule } from './product'
import { GQLStorageModule } from './storage'
import { Module } from '@nestjs/common'
import { config } from '../../config'
const merge = require('lodash/merge')

const gqlOptions: GqlModuleOptions = {
  ...getGqlModuleBaseOptions(config.gql.scanPaths),
  path: '/gql',
}

const imports: any[] = [GQLFoundationModule, GQLProductModule, GQLCartModule, GQLStorageModule]

if (process.env.NODE_ENV !== 'production') {
  merge(gqlOptions, {
    debug: true,
    playground: true,
    introspection: true,
  })
  imports.push(GQLDevUtilsModule)
}

@Module({
  providers: [DateTimeScalar],
  imports: [GraphQLModule.forRoot(gqlOptions), ...imports],
})
export class GQLContainerModule {}
