import * as admin from 'firebase-admin'
import { IdToken } from '../nest'
import { config } from '../base'

export interface AppConfigResponse {
  usersDir: string
}

export abstract class BaseAppService {
  async appConfig(): Promise<AppConfigResponse> {
    return {
      usersDir: config.storage.usersDir,
    }
  }

  async customToken(user: IdToken): Promise<string> {
    const token = await admin.auth().createCustomToken(user.uid, user.customClaims || {})
    return token
  }
}
