import { AppConfig, CORSConfig, FunctionsConfig, GQLConfig, StorageConfig } from './base'

export class ProdAppConfig implements AppConfig {
  readonly functions: FunctionsConfig = {
    region: 'asia-northeast1',
  }

  readonly cors: CORSConfig = {
    whitelist: ['https://vue-base-project-7295.web.app', 'https://vue-base-project-7295.firebaseapp.com'],

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
    scanPaths: ['dist/lib/services', 'dist/example/gql', 'dist/example/services'],
  }
}
