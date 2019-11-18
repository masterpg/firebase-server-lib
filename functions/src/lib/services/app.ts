import * as admin from 'firebase-admin'
import { IdToken } from '../nest'
import { Injectable } from '@nestjs/common'

@Injectable()
class AppService {
  async customToken(user: IdToken): Promise<string> {
    const token = await admin.auth().createCustomToken(user.uid, user.customClaims || {})
    return token
  }
}

export namespace AppServiceDI {
  export const symbol = Symbol(AppService.name)
  export const provider = {
    provide: symbol,
    useClass: AppService,
  }
  export type type = AppService
}
