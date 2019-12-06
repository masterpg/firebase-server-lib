import { SUPPORTED_REGIONS, config as _config } from 'firebase-functions'
const merge = require('lodash/merge')

export interface FunctionsConfig {
  readonly region: typeof SUPPORTED_REGIONS[number]
}

export interface StorageConfig {
  readonly bucket: string
  readonly usersDir: string
}

export interface CORSConfig {
  readonly whitelist: string[]
}

export class LibConfig {
  constructor(
    params: {
      functions?: Partial<FunctionsConfig>
      storage?: Partial<StorageConfig>
      cors?: Partial<CORSConfig>
    } = {}
  ) {
    this.functions = merge(
      {
        region: _config().functions.region || '',
      } as FunctionsConfig,
      params.functions || {}
    )

    this.storage = merge(
      {
        bucket: _config().storage.bucket || '',
        usersDir: 'users',
      } as StorageConfig,
      params.storage || {}
    )

    let whitelist: string[] = []
    if (_config().cors) {
      const str = _config().cors.whitelist || ''
      whitelist = str.split(',').map((item: string) => item.trim())
    }
    this.cors = merge(
      {
        whitelist,
      } as CORSConfig,
      params.cors || {}
    )
  }

  readonly functions: FunctionsConfig

  readonly storage: StorageConfig

  readonly cors: CORSConfig
}

export const config = new LibConfig()
