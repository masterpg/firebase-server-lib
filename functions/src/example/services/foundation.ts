import * as admin from 'firebase-admin'
import { AppStorageServiceDI, AppStorageServiceModule } from './storage'
import { BaseFoundationService, IdToken } from '../../lib'
import { Inject, Module } from '@nestjs/common'
import { AppConfigResponse } from '../gql.schema'
import { config } from '../../config'

//========================================================================
//
//  Implementation
//
//========================================================================

class FoundationService extends BaseFoundationService {
  @Inject(AppStorageServiceDI.symbol)
  protected readonly storageService!: AppStorageServiceDI.type

  async appConfig(): Promise<AppConfigResponse> {
    return {
      usersDir: config.storage.usersDir,
    }
  }

  async customToken(user: IdToken): Promise<string> {
    // user.customClaimsには開発や単体テストで必要なカスタムクレームが設定されてくる
    const token = await admin.auth().createCustomToken(user.uid, user.customClaims || {})
    return token
  }
}

namespace FoundationServiceDI {
  export const symbol = Symbol(FoundationService.name)
  export const provider = {
    provide: symbol,
    useClass: FoundationService,
  }
  export type type = FoundationService
}

@Module({
  providers: [FoundationServiceDI.provider],
  exports: [FoundationServiceDI.provider],
  imports: [AppStorageServiceModule],
})
class FoundationServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { FoundationServiceDI, FoundationServiceModule, AppConfigResponse }
