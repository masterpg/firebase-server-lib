import * as admin from 'firebase-admin'
import { EnvAppConfig } from './types'
import { IdToken } from './types'
import { Module } from '@nestjs/common'
import { config } from '../../config'

//========================================================================
//
//  Implementation
//
//========================================================================

class EnvService {
  async appConfig(): Promise<EnvAppConfig> {
    return {
      storage: {
        user: config.storage.user,
        article: config.storage.article,
      },
    }
  }

  async customToken(user: IdToken): Promise<string> {
    // user.customClaimsには開発や単体テストで必要なカスタムクレームが設定されてくる想定
    return await admin.auth().createCustomToken(user.uid, user.customClaims || {})
  }
}

namespace EnvServiceDI {
  export const symbol = Symbol(EnvService.name)
  export const provider = {
    provide: symbol,
    useClass: EnvService,
  }
  export type type = EnvService
}

@Module({
  providers: [EnvServiceDI.provider],
  exports: [EnvServiceDI.provider],
  imports: [],
})
class EnvServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { EnvServiceDI, EnvServiceModule }
