import * as admin from 'firebase-admin'
import { IdToken } from '../nest'
import { Inject } from '@nestjs/common'
import { LibStorageServiceDI } from './storage'
import { config } from '../base'

export interface AppConfigResponse {
  usersDir: string
}

export abstract class BaseAppService {
  @Inject(LibStorageServiceDI.symbol)
  protected readonly storageService!: LibStorageServiceDI.type

  async appConfig(): Promise<AppConfigResponse> {
    return {
      usersDir: config.storage.usersDir,
    }
  }

  async customToken(user: IdToken): Promise<string> {
    await this.storageService.assignUserDir(user)
    // user.customClaimsには開発や単体テストで必要なカスタムクレームが設定されてくる
    const token = await admin.auth().createCustomToken(user.uid, user.customClaims || {})
    return token
  }
}
