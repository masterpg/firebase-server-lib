import { GqlModuleOptions } from '@nestjs/graphql'
import { config } from '../../../../src/config'
import { getBaseGQLModuleOptions } from '../../../../src/app/gql'

export function getMockGQLModuleOptions(): GqlModuleOptions {
  const result: GqlModuleOptions = {
    ...getBaseGQLModuleOptions([...config.gql.schema.presetFiles]),
    path: '/dummyService',
  }
  return result
}
