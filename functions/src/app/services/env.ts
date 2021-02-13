import * as admin from 'firebase-admin'
import { IdToken } from './base'
import { Module } from '@nestjs/common'

//========================================================================
//
//  Implementation
//
//========================================================================

class EnvService {
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
