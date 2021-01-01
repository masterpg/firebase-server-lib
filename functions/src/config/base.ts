import { PartialAre, StorageArticlesConfig, StorageUsersConfig } from 'web-base-lib'
import { ClientOptions as ElasticConfig } from '@elastic/elasticsearch'
import { SUPPORTED_REGIONS } from 'firebase-functions'

//========================================================================
//
//  Interfaces
//
//========================================================================

interface AppConfig {
  readonly env: EnvConfig
  readonly firebase: FirebaseConfig
  readonly functions: FunctionsConfig
  readonly cors: CORSConfig
  readonly storage: StorageConfig
  readonly gql: GQLConfig
  readonly elastic: ElasticConfig
}

//--------------------------------------------------
//  Env
//--------------------------------------------------

interface EnvConfig {
  mode: 'prod' | 'dev' | 'test'
  readonly buildDir: string
}

//--------------------------------------------------
//  Functions
//--------------------------------------------------

interface FirebaseConfig {
  readonly apiKey: string
}

//--------------------------------------------------
//  Functions
//--------------------------------------------------

interface FunctionsConfig {
  readonly region: typeof SUPPORTED_REGIONS[number]
  readonly baseURL: string
}

//--------------------------------------------------
//  CORS
//--------------------------------------------------

interface CORSConfig {
  /**
   * 設定例: [
   *   'http://localhost',
   *   'http://localhost:5000',
   * ]
   */
  readonly whitelist: string[]
  /**
   * 設定例: [
   *   { method: 'GET', pattern: '^storage/' }
   *   { method: 'POST', pattern: '^rest/cartItems' }
   * ]
   */
  readonly excludes: CORSExcludeConfig[]
}

const CORSExcludeConfigMethods = ['GET', 'PUT', 'POST', 'DELETE']

interface CORSExcludeConfig {
  readonly method?: typeof CORSExcludeConfigMethods[number]
  readonly pattern: string
}

//--------------------------------------------------
//  Storage
//--------------------------------------------------

interface StorageConfig {
  readonly bucket: string
  readonly user: StorageUsersConfig
  readonly article: StorageArticlesConfig
}

interface StorageUsersConfig {
  rootName: string
}

interface StorageArticlesConfig {
  rootName: string
  fileName: string
  assetsName: string
}

//--------------------------------------------------
//  GraphQL
//--------------------------------------------------

interface GQLConfig {
  schemaFilesOrDirs: string[]
}

//========================================================================
//
//  Implementation
//
//========================================================================

class EnvConfigImpl implements EnvConfig {
  constructor(params: { mode: EnvConfig['mode'] }) {
    this.mode = params.mode
  }

  readonly mode: EnvConfig['mode']
  readonly buildDir = 'dist'
}

class FunctionsConfigImpl implements FunctionsConfig {
  constructor(params: PartialAre<FunctionsConfig, 'region'>) {
    this.region = params.region || 'asia-northeast1'
    this.baseURL = params.baseURL
  }

  readonly region: typeof SUPPORTED_REGIONS[number]
  readonly baseURL: string
}

class CORSConfigImpl implements CORSConfig {
  constructor(params: CORSConfig) {
    this.excludes = params.excludes
    this.whitelist = params.whitelist
  }

  readonly excludes: CORSExcludeConfig[]
  readonly whitelist: string[]
}

class StorageConfigImpl implements StorageConfig {
  constructor(params: { bucket: string }) {
    this.bucket = params.bucket
    this.user = {
      rootName: StorageUsersConfig.RootName,
    }
    this.article = {
      rootName: StorageArticlesConfig.RootName,
      fileName: StorageArticlesConfig.FileName,
      assetsName: StorageArticlesConfig.AssetsName,
    }
  }

  readonly bucket: string
  readonly user: StorageUsersConfig
  readonly article: StorageArticlesConfig
}

class GQLConfigImpl implements GQLConfig {
  constructor(params: GQLConfig) {
    this.schemaFilesOrDirs = params.schemaFilesOrDirs
  }

  readonly schemaFilesOrDirs: string[]
}

abstract class BaseAppConfig implements AppConfig {
  abstract readonly env: EnvConfig
  abstract readonly firebase: FirebaseConfig
  abstract readonly functions: FunctionsConfig
  abstract readonly cors: CORSConfig
  abstract readonly storage: StorageConfig
  abstract readonly gql: GQLConfig
  abstract readonly elastic: ElasticConfig
}

//========================================================================
//
//  Exports
//
//========================================================================

export { EnvConfig, FunctionsConfig, CORSConfig, StorageConfig, GQLConfig, ElasticConfig, AppConfig, BaseAppConfig }
export { EnvConfigImpl, FunctionsConfigImpl, CORSConfigImpl, StorageConfigImpl, GQLConfigImpl }
