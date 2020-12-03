import { BaseAppConfig, CORSConfigImpl, EnvConfigImpl, FunctionsConfigImpl, GQLConfigImpl, StorageConfigImpl } from './base'

//========================================================================
//
//  Implementation
//
//========================================================================

class ProdAppConfig extends BaseAppConfig {
  readonly env = new EnvConfigImpl({ mode: 'prod' })

  readonly functions = new FunctionsConfigImpl({
    region: 'asia-northeast1',
  })

  readonly cors = new CORSConfigImpl({
    whitelist: ['https://lived-web-app-b9f08.web.app', 'https://lived-web-app-b9f08.firebaseapp.com'],
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

export { ProdAppConfig }
