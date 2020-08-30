import { PartialAre } from 'web-base-lib'
import { SUPPORTED_REGIONS } from 'firebase-functions'

//========================================================================
//
//  Interfaces
//
//========================================================================

interface LibConfig {
  readonly functions: FunctionsConfig
  readonly cors: CORSConfig
  readonly storage: StorageConfig
}

interface AppConfig extends LibConfig {
  readonly gql: GQLConfig
}

//--------------------------------------------------
//  Functions
//--------------------------------------------------

interface FunctionsConfig {
  readonly region: typeof SUPPORTED_REGIONS[number]
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
  schema: {
    presetFiles: string[]
    moduleDir: string
  }
}

//========================================================================
//
//  Implementation
//
//========================================================================

class FunctionsConfigImpl implements FunctionsConfig {
  constructor(params: { region: typeof SUPPORTED_REGIONS[number] }) {
    this.region = params.region
  }

  readonly region: typeof SUPPORTED_REGIONS[number]
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
  constructor(params: PartialAre<StorageConfig, 'user' | 'article'>) {
    this.bucket = params.bucket
    this.user = {
      rootName: params.user?.rootName ?? 'users',
    }
    this.article = {
      rootName: params.article?.rootName ?? 'articles',
      fileName: params.article?.fileName ?? '__index__.md',
      assetsName: params.article?.assetsName ?? 'assets',
    }
  }

  readonly bucket: string
  readonly user: StorageUsersConfig
  readonly article: StorageArticlesConfig
}

class GQLConfigImpl implements GQLConfig {
  constructor(params: GQLConfig) {
    this.schema = params.schema
  }

  schema: { presetFiles: string[]; moduleDir: string }
}

abstract class BaseAppConfig implements AppConfig {
  abstract readonly functions: FunctionsConfig
  abstract readonly cors: CORSConfig
  abstract readonly storage: StorageConfig
  abstract readonly gql: GQLConfig
}

//========================================================================
//
//  Exports
//
//========================================================================

export { FunctionsConfig, CORSConfig, StorageConfig, GQLConfig, LibConfig, AppConfig, BaseAppConfig }
export { FunctionsConfigImpl, CORSConfigImpl, StorageConfigImpl, GQLConfigImpl }
