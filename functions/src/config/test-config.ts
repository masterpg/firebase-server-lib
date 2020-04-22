import { AppConfig, CORSConfig, FunctionsConfig, GQLConfig, StorageConfig } from './base'

export class TestAppConfig implements AppConfig {
  readonly functions: FunctionsConfig = {
    region: 'asia-northeast1',
  }

  readonly cors: CORSConfig = {
    whitelist: ['http://localhost'],

    excludes: [
      {
        method: 'GET',
        pattern: '^rest/site',
      },
      {
        method: 'GET',
        pattern: '^rest/unit/partner/',
      },
    ],
  }

  readonly storage: StorageConfig = {
    bucket: 'gs://vue-base-project-7295.appspot.com/',
    usersDir: 'users',
  }

  readonly gql: GQLConfig = {
    scanPaths: ['src/lib/services', 'src/example/gql', 'src/example/services', 'tests/mocks/lib/gql'],
  }
}
