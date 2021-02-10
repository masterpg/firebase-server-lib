import * as admin from 'firebase-admin'
import { AppError } from '../../base'
import { UserClaims } from '../types'
import { auth } from 'firebase-admin/lib/auth'
import { pickProps } from 'web-base-lib'
import UserRecord = auth.UserRecord

//========================================================================
//
//  Implementation
//
//========================================================================

class ServiceHelper {
  //----------------------------------------------------------------------
  //
  //  Static
  //
  //----------------------------------------------------------------------

  /**
   * トークンからユーザークレイムのみを抽出します。
   * @param idToken
   */
  static pickUserClaims(idToken: UserClaims): UserClaims {
    return pickProps(idToken, ['isAppAdmin', 'authStatus', 'readableNodeId', 'writableNodeId'])
  }

  /**
   * Firebaseのユーザーレコードを取得します。
   * @param uid
   */
  static async getUserRecord(uid: string): Promise<UserRecord> {
    let userRecord!: UserRecord
    try {
      userRecord = await admin.auth().getUser(uid)
    } catch (err) {
      throw new AppError(`There is no user.`, { uid })
    }
    return userRecord
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export { ServiceHelper }
