import * as admin from 'firebase-admin'
import { IdToken } from '../base'
import { Injectable } from '@nestjs/common'
import { config } from '../../base/config'

@Injectable()
class AppService {
  async customToken(user: IdToken): Promise<string> {
    const token = await admin.auth().createCustomToken(user.uid, {
      isAppAdmin: config.role.app.admins.includes(user.email),
    })
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
