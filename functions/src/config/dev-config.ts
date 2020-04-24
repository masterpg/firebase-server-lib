import { AppConfig, CORSConfig, FunctionsConfig, GQLConfig, StorageConfig } from './base'

export class DevAppConfig implements AppConfig {
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
    bucket: 'gs://vue-base-project-7295.appspot.com/',
    usersDir: 'users',
  }

  readonly gql: GQLConfig = {
    schema: {
      presetFiles: ['dist/lib/services/dto.graphql', 'dist/example/services/dto.graphql'],
      moduleDir: 'dist/example/gql',
    },
  }
}
