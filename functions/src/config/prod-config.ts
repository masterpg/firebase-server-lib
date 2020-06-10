import { AppConfig, CORSConfig, FunctionsConfig, GQLConfig, StorageConfig } from './base'

//========================================================================
//
//  Implementation
//
//========================================================================

class ProdAppConfig implements AppConfig {
  readonly functions: FunctionsConfig = {
    region: 'asia-northeast1',
  }

  readonly cors: CORSConfig = {
    whitelist: ['https://lived-web-app-b9f08.web.app', 'https://lived-web-app-b9f08.firebaseapp.com'],

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

export { ProdAppConfig }
