import { SUPPORTED_REGIONS } from 'firebase-functions'

//========================================================================
//
//  Configs
//
//========================================================================

export interface FunctionsConfig {
  readonly region: typeof SUPPORTED_REGIONS[number]
}

const CORSExcludeConfigMethods = ['GET', 'PUT', 'POST', 'DELETE']

export interface CORSExcludeConfig {
  readonly method?: typeof CORSExcludeConfigMethods[number]
  readonly pattern: string
}

export interface CORSConfig {
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

export interface StorageConfig {
  readonly bucket: string
  readonly usersDir: string
}

export interface GQLConfig {
  schema: {
    presetFiles: string[]
    moduleDir: string
  }
}

//========================================================================
//
//  LibConfig
//
//========================================================================

export interface LibConfig {
  readonly functions: FunctionsConfig
  readonly cors: CORSConfig
  readonly storage: StorageConfig
}

//========================================================================
//
//  AppConfig
//
//========================================================================

export interface AppConfig extends LibConfig {
  readonly gql: GQLConfig
}
