import { BaseAppConfig, CORSConfigImpl, FunctionsConfigImpl, GQLConfigImpl, StorageConfigImpl } from './base'

//========================================================================
//
//  Implementation
//
//========================================================================

class TestAppConfig extends BaseAppConfig {
  constructor() {
    super()
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:5020'
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
    schema: {
      presetFiles: ['dist/example/services/dto.graphql', 'tests/mocks/lib/gql/dummy/schema.graphql'],
      moduleDir: 'dist/example/gql',
    },
  })
}

//========================================================================
//
//  Exports
//
//========================================================================

export { TestAppConfig }
