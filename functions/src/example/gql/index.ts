import { DateTimeScalar, getGqlModuleBaseOptions } from '../../lib'
import { GqlModuleOptions, GraphQLModule } from '@nestjs/graphql'
import { GQLCartModule } from './modules/cart'
import { GQLDevUtilsModule } from './modules/dev'
import { GQLFoundationModule } from './modules/foundation'
import { GQLProductModule } from './modules/product'
import { GQLStorageModule } from './modules/storage'
import { Module } from '@nestjs/common'
const merge = require('lodash/merge')

const gqlOptions: GqlModuleOptions = {
  ...getGqlModuleBaseOptions('dist/example/gql/modules'),
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
