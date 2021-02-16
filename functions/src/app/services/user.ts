import * as admin from 'firebase-admin'
import { AuthDataResult, AuthStatus, SetUserInfoResult, SetUserInfoResultStatus, User, UserClaims, UserInput } from './base'
import { UserHelper, UserSchema } from './base'
import { AppError } from '../base'
import { Module } from '@nestjs/common'
import dayjs = require('dayjs')
import { newElasticClient } from '../base/elastic'
import UserRecord = admin.auth.UserRecord

//========================================================================
//
//  Interfaces
//
//========================================================================

enum AuthProviderType {
  Google = 'google.com',
  Facebook = 'facebook.com',
  Password = 'password',
  Anonymous = 'anonymous',
}

//========================================================================
//
//  Implementation
//
//========================================================================

class UserService {
  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  protected readonly client = newElasticClient()

  protected readonly userHelper = new UserHelper(this.client)

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  async getAuthData(uid: string): Promise<AuthDataResult> {
    let status: AuthStatus = 'WaitForEntry'
    let userRecord!: UserRecord
    try {
      userRecord = await UserHelper.getUserRecord(uid)
    } catch (err) {
      const detail = JSON.stringify({ uid })
      throw new Error(`There is no user: ${detail}`)
    }

    // ユーザー情報の取得
    const user = await this.getUser({ id: uid })

    // アカウントが持つ認証プロバイダの中にパスワード認証があるか調べる
    const passwordProviderExists = userRecord.providerData.some(provider => provider.providerId === AuthProviderType.Password)

    // アカウントが持つ認証プロバイダにパスワード認証があり、
    // その認証でメールアドレス確認が行われていない場合
    if (passwordProviderExists && !userRecord.emailVerified) {
      // ユーザーに送信した確認メールの回答待ち
      status = 'WaitForEmailVerified'
    }
    // 上記以外の場合
    else {
      // ユーザー情報があれば有効なユーザー、なければユーザー情報登録待ち
      status = user ? 'Available' : 'WaitForEntry'
    }

    // 認証ステータスをトークンに設定
    const userClaims: UserClaims | undefined = userRecord.customClaims
    delete userClaims?.readableNodeId
    delete userClaims?.writableNodeId
    await admin.auth().setCustomUserClaims(uid, {
      ...userClaims,
      authStatus: status,
    })

    // カスタムトークンの取得
    const token = await admin.auth().createCustomToken(uid, {})

    return { status, token, user }
  }

  async setUserInfo(uid: string, input: UserInput): Promise<SetUserInfoResult> {
    UserService.validateUserName(input.userName)
    UserService.validateFullName(input.fullName)

    let userRecord!: UserRecord
    try {
      userRecord = await UserHelper.getUserRecord(uid)
    } catch (err) {
      throw new AppError(`There is no user.`, { uid })
    }

    let user = await this.getUser({ id: userRecord.uid })

    // 同じ名前のユーザー名がないことを検証
    const countResponse = await this.client.count({
      index: UserSchema.IndexAlias,
      body: {
        query: {
          bool: {
            must: [
              {
                bool: { must_not: [{ term: { id: userRecord.uid } }] },
              },
              { term: { userNameLower: input.userName.toLowerCase() } },
            ],
          },
        },
      },
    })
    const alreadyExist = countResponse.body.count > 0
    if (alreadyExist) {
      return { status: 'AlreadyExists' }
    }

    // ユーザー情報の登録
    const now = dayjs()
    const isAppAdmin = Boolean((userRecord.customClaims as UserClaims)?.isAppAdmin)
    await this.client.update({
      index: UserSchema.IndexAlias,
      id: userRecord.uid,
      body: {
        doc: {
          ...UserSchema.toDBEntity({
            id: userRecord.uid,
            userName: input.userName,
            fullName: input.fullName,
            isAppAdmin,
            photoURL: input.photoURL,
            version: user?.version ? user.version + 1 : 1,
            createdAt: user?.createdAt ?? now,
            updatedAt: now,
          }),
        },
        doc_as_upsert: true,
      },
      refresh: true,
    })

    user = (await this.getUser({ id: userRecord.uid }))!
    return { status: 'Success', user }
  }

  async getUser(key: { id?: string; userName?: string }): Promise<User | undefined> {
    const user = await this.userHelper.getUser(key)
    if (!user) return

    const userRecord = await UserHelper.getUserRecord(user.id)

    return {
      ...user,
      email: userRecord.email!,
      emailVerified: userRecord.emailVerified,
    }
  }

  async deleteUser(uid: string): Promise<void> {
    // Firebaseユーザーを取得
    let userRecord: UserRecord | undefined
    try {
      userRecord = await UserHelper.getUserRecord(uid)
    } catch (e) {
      // 存在しないuidでgetUser()するとエラーが発生するのでtry-catchしている
    }

    if (userRecord) {
      // Firebaseユーザーを削除
      await admin.auth().deleteUser(userRecord.uid)
    }

    // データベースのユーザー情報を削除
    await this.client.deleteByQuery({
      index: UserSchema.IndexAlias,
      body: {
        query: {
          term: { id: uid },
        },
      },
      refresh: true,
    })
  }

  //----------------------------------------------------------------------
  //
  //  Static
  //
  //----------------------------------------------------------------------

  /**
   * ユーザー名の検証を行います。
   * @param userName
   */
  static validateUserName(userName?: string): void {
    function throwInvalidError(): never {
      throw new AppError(`The specified 'userName' is invalid.`, { userName })
    }

    if (!userName) {
      throw new AppError(`The specified 'userName' is empty.`)
    }

    // 60文字以下であることを検証
    if (userName.length > 60) throwInvalidError()

    // 英(大小)数と｢-_｣以外の文字が使用されていないことを検証
    if (/[^a-zA-Z0-9.\-_]/.test(userName)) throwInvalidError()
  }

  /**
   * フルネームの検証を行います。
   * @param fullName
   */
  static validateFullName(fullName?: string): void {
    function throwInvalidError(): never {
      throw new AppError(`The specified 'fullName' is invalid.`, { fullName })
    }

    if (!fullName) {
      throw new AppError(`The specified 'fullName' is empty.`)
    }

    // 60文字以下であることを検証
    if (fullName.length > 60) throwInvalidError()

    // 禁則文字が使用されていないことを検証
    /* eslint-disable no-irregular-whitespace */
    // ※ 改行、タブ、｢<>^*~　｣
    if (/\n|\r|\r\n|\t|[<>^*~　]/.test(fullName)) {
      throwInvalidError()
    }
    /* eslint-disable no-irregular-whitespace */
  }
}

namespace UserServiceDI {
  export const symbol = Symbol(UserService.name)
  export const provider = {
    provide: symbol,
    useClass: UserService,
  }
  export type type = UserService
}

@Module({
  providers: [UserServiceDI.provider],
  exports: [UserServiceDI.provider],
})
class UserServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { UserService, UserServiceDI, UserServiceModule }
