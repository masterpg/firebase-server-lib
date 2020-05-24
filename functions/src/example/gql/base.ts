import { DateTimeScalar, getBaseGQLModuleOptions } from '../../lib/gql'
import { GqlModuleOptions } from '@nestjs/graphql'
import { Module } from '@nestjs/common'
import { config } from '../../config'
import { isDevelopment } from '../base'
import { merge } from 'lodash'

export function getGQLModuleOptions(schemaFiles: string[]): GqlModuleOptions {
  const result: GqlModuleOptions = {
    ...getBaseGQLModuleOptions([...config.gql.schema.presetFiles, ...schemaFiles]),
    path: '/',
  }
  if (isDevelopment()) {
    merge(result, {
      debug: true,
      playground: true,
      introspection: true,
    })
  }
  return result
}

@Module({
  providers: [DateTimeScalar],
})
export class BaseGQLModule {}
