import { BaseAppConfig, CORSConfigImpl, EnvConfigImpl, FunctionsConfigImpl, GQLConfigImpl, StorageConfigImpl } from './base'
import { dev as privateConfig } from './private'

//========================================================================
//
//  Implementation
//
//========================================================================

class DevAppConfig extends BaseAppConfig {
  readonly env = new EnvConfigImpl({ mode: 'dev' })

  readonly firebase = {
    ...privateConfig.firebase,
  }

  readonly functions = new FunctionsConfigImpl({
    ...privateConfig.functions,
  })

  readonly storage = new StorageConfigImpl({
    ...privateConfig.storage,
  })

  readonly cors = new CORSConfigImpl({
    ...privateConfig.cors,
    excludes: [{ method: 'GET', pattern: '^storage/' }],
  })

  readonly gql = new GQLConfigImpl({
    schemaFilesOrDirs: ['dist/app/gql'],
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

export { DevAppConfig }
