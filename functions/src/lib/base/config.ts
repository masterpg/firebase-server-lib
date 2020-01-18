import { SUPPORTED_REGIONS, config as _config } from 'firebase-functions'

export interface FunctionsConfig {
  readonly region: typeof SUPPORTED_REGIONS[number]
}

export interface StorageConfig {
  readonly bucket: string
  readonly usersDir: string
}

const CORSExcludeConfigMethods = ['GET', 'PUT', 'POST', 'DELETE']

export interface CORSExcludeConfig {
  method?: typeof CORSExcludeConfigMethods[number]
  pattern: string
}

export interface CORSConfig {
  /**
   * 設定例: cors.whitelist="http://localhost, http://localhost:5000"
   */
  readonly whitelist: string[]
  /**
   * 設定例: cors.excludes="^storage/users/, POST:^rest/cartItems"
   */
  readonly excludes: CORSExcludeConfig[]
}

export class LibConfig {
  //----------------------------------------------------------------------
  //
  //  Constructor
  //
  //----------------------------------------------------------------------

  constructor() {
    this.functions = {
      region: _config().functions.region || '',
    } as FunctionsConfig

    this.storage = {
      bucket: _config().storage.bucket || '',
      usersDir: 'users',
    } as StorageConfig

    this.cors = {
      whitelist: this.getCORSWhitelist(_config().cors.whitelist),
      excludes: this.getCORSExcludes(_config().cors.excludes),
    } as CORSConfig
  }

  //----------------------------------------------------------------------
  //
  //  Properties
  //
  //----------------------------------------------------------------------

  readonly functions: FunctionsConfig

  readonly storage: StorageConfig

  readonly cors: CORSConfig

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  private getCORSWhitelist(value?: string): string[] {
    if (!value) return []

    return value.split(',').map((item: string) => item.trim())
  }

  private getCORSExcludes(value?: string): CORSExcludeConfig[] {
    if (!value) return []

    const result: CORSExcludeConfig[] = []
    for (const itemStr of value.split(',')) {
      if (!itemStr) continue

      const itemArr = itemStr.trim().split(':')

      if (itemArr.length === 1) {
        result.push({ pattern: itemArr[0] })
      } else if (itemArr.length === 2) {
        const method: typeof CORSExcludeConfigMethods[number] = itemArr[0].toUpperCase()
        if (!CORSExcludeConfigMethods.includes(method)) {
          throw new Error(`The value of method setting 'cors.excludes' is invalid: '${method}'`)
        }
        result.push({ method, pattern: itemArr[1] })
      } else {
        throw new Error(`The format of setting 'cors.excludes' is invalid: '${itemStr}'`)
      }
    }

    return result
  }
}

export const config = new LibConfig()
