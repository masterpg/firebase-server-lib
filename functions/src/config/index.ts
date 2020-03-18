import { AppConfig } from './base'
import { DevAppConfig } from './dev-config'
import { ProdAppConfig } from './prod-config'
import { TestAppConfig } from './test-config'

export const config: AppConfig = (() => {
  switch (process.env.NODE_ENV) {
    case 'production': {
      return new ProdAppConfig()
    }
    case 'test': {
      return new TestAppConfig()
    }
    default: {
      return new DevAppConfig()
    }
  }
})()
