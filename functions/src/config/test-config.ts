import { BaseAppConfig, CORSConfigImpl, FunctionsConfigImpl, GQLConfigImpl, StorageConfigImpl } from './base'

//========================================================================
//
//  Implementation
//
//========================================================================

class TestAppConfig extends BaseAppConfig {
  constructor() {
    super()
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:5012'
  }

  readonly functions = new FunctionsConfigImpl({
    region: 'asia-northeast1',
  })

  readonly cors = new CORSConfigImpl({
    whitelist: ['http://localhost'],
    excludes: [{ method: 'GET', pattern: '^dummyRESTService/partner/' }],
  })

  readonly storage = new StorageConfigImpl({
    bucket: 'gs://staging.lived-web-app-b9f08.appspot.com/',
  })

  readonly gql = new GQLConfigImpl({
    schemaFilesOrDirs: ['dist/app/gql', 'tests/mocks/app/gql/dummy/schema.graphql'],
  })
}

//========================================================================
//
//  Exports
//
//========================================================================

export { TestAppConfig }
