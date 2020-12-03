import { BaseAppConfig, CORSConfigImpl, EnvConfigImpl, FunctionsConfigImpl, GQLConfigImpl, StorageConfigImpl } from './base'

//========================================================================
//
//  Implementation
//
//========================================================================

class DevAppConfig extends BaseAppConfig {
  readonly env = new EnvConfigImpl({ mode: 'dev' })

  readonly functions = new FunctionsConfigImpl({
    region: 'asia-northeast1',
  })

  readonly cors = new CORSConfigImpl({
    whitelist: [
      'http://localhost',
      'http://localhost:5000',
      'http://localhost:5010',
      'http://localhost:5030',
      'chrome-extension://aejoelaoggembcahagimdiliamlcdmfm',
    ],
    excludes: [{ method: 'GET', pattern: '^storage/' }],
  })

  readonly storage = new StorageConfigImpl({
    bucket: 'gs://lived-web-app-b9f08.appspot.com/',
  })

  readonly gql = new GQLConfigImpl({
    schemaFilesOrDirs: ['dist/app/gql'],
  })
}

//========================================================================
//
//  Exports
//
//========================================================================

export { DevAppConfig }
