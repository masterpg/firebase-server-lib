import { SUPPORTED_REGIONS } from 'firebase-functions'

//========================================================================
//
//  Interfaces
//
//========================================================================

interface FunctionsConfig {
  readonly region: typeof SUPPORTED_REGIONS[number]
}

const CORSExcludeConfigMethods = ['GET', 'PUT', 'POST', 'DELETE']

interface CORSExcludeConfig {
  readonly method?: typeof CORSExcludeConfigMethods[number]
  readonly pattern: string
}

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

interface StorageConfig {
  readonly bucket: string
  readonly usersDir: string
}

interface GQLConfig {
  schema: {
    presetFiles: string[]
    moduleDir: string
  }
}

interface LibConfig {
  readonly functions: FunctionsConfig
  readonly cors: CORSConfig
  readonly storage: StorageConfig
}

interface AppConfig extends LibConfig {
  readonly gql: GQLConfig
}

//========================================================================
//
//  Implementation
//
//========================================================================

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

export { FunctionsConfig, CORSExcludeConfig, CORSConfig, StorageConfig, GQLConfig, LibConfig, AppConfig, BaseAppConfig }
