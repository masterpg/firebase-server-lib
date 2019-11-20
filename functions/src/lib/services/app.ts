import * as admin from 'firebase-admin'
import { IdToken } from '../nest'

export abstract class BaseAppService {
  async customToken(user: IdToken): Promise<string> {
    const token = await admin.auth().createCustomToken(user.uid, user.customClaims || {})
    return token
  }
}
