import { AppConfig, CORSConfig, FunctionsConfig, StorageConfig } from './base'

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
    ],
  }

  readonly storage: StorageConfig = {
    bucket: 'gs://vue-base-project-7295.appspot.com/',
    usersDir: 'users',
  }
}
