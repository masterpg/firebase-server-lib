import { SUPPORTED_REGIONS, config as _config } from 'firebase-functions'

export const config = new (class {
  functions = new (class {
    get region(): typeof SUPPORTED_REGIONS[number] {
      return _config().functions.region || ''
    }
  })()

  readonly app = new (class {
    get credential(): string {
      return _config().app.credential || ''
    }
  })()

  readonly storage = new (class {
    get bucket(): string {
      return _config().storage.bucket || ''
    }
  })()

  readonly cors = new (class {
    get whitelist(): string[] {
      if (_config().cors) {
        const whitelist = _config().cors.whitelist || ''
        return whitelist.split(',').map((item: string) => item.trim())
      }
      return []
    }
  })()
})()
