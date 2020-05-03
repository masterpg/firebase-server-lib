import { AppConfig, CORSConfig, FunctionsConfig, GQLConfig, StorageConfig } from './base'

//========================================================================
//
//  Implementation
//
//========================================================================

class TestAppConfig implements AppConfig {
  readonly functions: FunctionsConfig = {
    region: 'asia-northeast1',
  }

  readonly cors: CORSConfig = {
    whitelist: ['http://localhost'],

    excludes: [
      {
        method: 'GET',
        pattern: '^dummyRESTService/partner/',
      },
    ],
  }

  readonly storage: StorageConfig = {
    bucket: 'gs://vue-base-project-7295.appspot.com/',
    usersDir: 'users',
  }

  readonly gql: GQLConfig = {
    schema: {
      presetFiles: ['dist/example/services/dto.graphql', 'tests/mocks/lib/gql/dummy/schema.graphql'],
      moduleDir: 'dist/example/gql',
    },
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export { TestAppConfig }
