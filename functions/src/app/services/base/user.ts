import * as admin from 'firebase-admin'
import { ElasticClient, ElasticSearchResponse } from '../../base/elastic'
import { User, UserClaims } from './index'
import { AppError } from '../../base'
import { UserSchema } from './index'
import { auth } from 'firebase-admin/lib/auth'
import { pickProps } from 'web-base-lib'
import UserRecord = auth.UserRecord
import DBUser = UserSchema.DBUser

//========================================================================
//
//  Implementation
//
//========================================================================

class UserHelper {
  //----------------------------------------------------------------------
  //
  //  Constructor
  //
  //----------------------------------------------------------------------

  constructor(protected client: ElasticClient) {}

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  /**
   * 指定されたキーのユーザーをデータベースから取得します。
   * @param key
   */
  async getUser(key: { id?: string; userName?: string }): Promise<Omit<User, 'email' | 'emailVerified'> | undefined> {
    const { id, userName } = key
    if (!id && !userName) {
      throw new AppError(`Neither "id" nor "userName" is specified.`)
    }

    const response = await this.client.search<ElasticSearchResponse<DBUser>>({
      index: UserSchema.IndexAlias,
      body: {
        query: {
          term: id ? { id } : { userName },
        },
      },
    })

    const users = UserSchema.dbResponseToAppEntities(response)
    if (!users.length) return

    return users[0]
  }

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

export { UserHelper }
