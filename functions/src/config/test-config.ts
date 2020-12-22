import { BaseAppConfig, CORSConfigImpl, EnvConfigImpl, FunctionsConfigImpl, GQLConfigImpl, StorageConfigImpl } from './base'
import { test as privateConfig } from './private'

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

  readonly env = new EnvConfigImpl({ mode: 'test' })

  readonly firebase = {
    ...privateConfig.firebase,
  }

  readonly functions = new FunctionsConfigImpl({
    ...privateConfig.functions,
  })

  readonly cors = new CORSConfigImpl({
    ...privateConfig.cors,
    excludes: [{ method: 'GET', pattern: '^dummyRESTService/partner/' }],
  })

  readonly storage = new StorageConfigImpl({
    ...privateConfig.storage,
  })

  readonly gql = new GQLConfigImpl({
    schemaFilesOrDirs: ['dist/app/gql', 'tests/mocks/app/gql'],
  })

  readonly elastic = {
    ...privateConfig.elastic,
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export { TestAppConfig }
