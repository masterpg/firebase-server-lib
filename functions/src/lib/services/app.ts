import * as admin from 'firebase-admin'
import { BaseStorageService } from './storage'
import { IdToken } from '../nest'
import { config } from '../base'

export interface AppConfigResponse {
  usersDir: string
}

export abstract class BaseAppService {
  protected abstract readonly storageService: BaseStorageService

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
