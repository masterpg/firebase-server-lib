import { BaseAppConfig, CORSConfig, FunctionsConfig, GQLConfig, StorageConfig } from './base'

//========================================================================
//
//  Implementation
//
//========================================================================

class DevAppConfig extends BaseAppConfig {
  readonly functions: FunctionsConfig = {
    region: 'asia-northeast1',
  }

  readonly cors: CORSConfig = {
    whitelist: ['http://localhost', 'http://localhost:5000', 'http://localhost:5010', 'chrome-extension://aejoelaoggembcahagimdiliamlcdmfm'],

    excludes: [
      {
        method: 'GET',
        pattern: '^storage/',
      },
    ],
  }

  readonly storage: StorageConfig = {
    bucket: 'gs://lived-web-app-b9f08.appspot.com/',
    usersDir: 'users',
  }

  readonly gql: GQLConfig = {
    schema: {
      presetFiles: ['dist/example/services/dto.graphql'],
      moduleDir: 'dist/example/gql',
    },
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export { DevAppConfig }
