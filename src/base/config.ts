import { SUPPORTED_REGIONS, config as _config } from 'firebase-functions'

export const config = new (class {
  functions = new (class {
    get region(): typeof SUPPORTED_REGIONS[number] {
      return _config().functions.region || ''
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

  readonly role = new (class {
    readonly app = new (class {
      get admins(): string[] {
        if (_config().role && _config().role.app) {
          const admins = _config().role.app.admins || ''
          return admins.split(',').map((item: string) => item.trim())
        }
        return []
      }
    })()
  })()
})()
