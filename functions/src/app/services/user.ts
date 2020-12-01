import * as admin from 'firebase-admin'
import { AppStorageServiceDI, AppStorageServiceModule } from './storage'
import { AuthDataResult, AuthStatus, UserInfo, UserInfoInput } from './types'
import { Inject, Module } from '@nestjs/common'
import { StoreServiceDI, StoreServiceModule } from './base/store'
import { EntityId } from '../../firestore-ex'
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
  @Inject(StoreServiceDI.symbol)
  protected readonly storeService!: StoreServiceDI.type

  @Inject(AppStorageServiceDI.symbol)
  protected readonly storageService!: AppStorageServiceDI.type

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  async getAuthData(uid: string): Promise<AuthDataResult> {
    let status = AuthStatus.WaitForEntry
    let userRecord!: UserRecord
    try {
      userRecord = await admin.auth().getUser(uid)
    } catch (err) {
      const detail = JSON.stringify({ uid })
      throw new Error(`There is no user: ${detail}`)
    }

    // ユーザー情報の取得
    const user = await this.getUser(uid)

    // アカウントが持つ認証プロバイダの中にパスワード認証があるか調べる
    const passwordProviderExists = userRecord.providerData.some(provider => provider.providerId === AuthProviderType.Password)

    // アカウントが持つ認証プロバイダにパスワード認証があり、
    // その認証でメールアドレス確認が行われていない場合
    if (passwordProviderExists && !userRecord.emailVerified) {
      // ユーザーに送信した確認メールの回答待ち
      status = AuthStatus.WaitForEmailVerified
    }
    // 上記以外の場合
    else {
      // ユーザー情報があれば有効なユーザー、なければユーザー情報登録待ち
      status = user ? AuthStatus.Available : AuthStatus.WaitForEntry
    }

    // 認証ステータスをトークンに設定
    await admin.auth().setCustomUserClaims(uid, {
      ...userRecord.customClaims,
      authStatus: status,
    })

    // カスタムトークンの取得
    const token = await admin.auth().createCustomToken(uid, {})

    return { status, token, user }
  }

  async setUserInfo(uid: string, input: UserInfoInput): Promise<UserInfo> {
    const userInput: EntityId & UserInfoInput = { id: uid, ...input }
    let userRecord!: UserRecord
    try {
      userRecord = await admin.auth().getUser(userInput.id)
    } catch (err) {
      const detail = JSON.stringify({ uid })
      throw new Error(`There is no user: ${detail}`)
    }
    const storeUser = await this.storeService.userDao.fetch(userInput.id)

    if (!storeUser) {
      await this.storeService.runBatch(async batch => {
        await this.storeService.userDao.set(userInput, batch)
        await this.storeService.publicProfileDao.set(
          {
            ...userInput,
            photoURL: userRecord.photoURL,
          },
          batch
        )
      })
    } else {
      await this.storeService.runBatch(async batch => {
        await this.storeService.userDao.update(userInput, batch)
        await this.storeService.publicProfileDao.update(
          {
            ...userInput,
            photoURL: userRecord.photoURL,
          },
          batch
        )
      })
    }

    return (await this.getUser(userInput.id))!
  }

  async getUser(uid: string): Promise<UserInfo | undefined> {
    const storeUser = await this.storeService.userDao.fetch(uid)
    if (!storeUser) return

    const publicProfile = await this.storeService.publicProfileDao.fetch(uid)
    if (!publicProfile) {
      const { id, fullName } = storeUser
      const user = { id, fullName }
      throw new Error(`Public profile not found: ${user}`)
    }

    const userRecord = await admin.auth().getUser(uid)

    return {
      ...storeUser,
      email: userRecord.email!,
      emailVerified: userRecord.emailVerified,
      isAppAdmin: Boolean(userRecord.customClaims?.isAppAdmin),
      publicProfile,
    }
  }

  async deleteUser(uid: string): Promise<void> {
    // Firebaseユーザーを取得
    let userRecord: UserRecord | undefined
    try {
      userRecord = await admin.auth().getUser(uid)
    } catch (e) {
      // 存在しないuidでgetUser()するとエラーが発生するのでtry-catchしている
    }

    if (userRecord) {
      // Firebaseユーザーを削除
      await admin.auth().deleteUser(userRecord.uid)
    }

    // ストアのユーザー情報を削除
    await this.storeService.runBatch(async batch => {
      await this.storeService.userDao.delete(uid, batch)
      await this.storeService.publicProfileDao.delete(uid, batch)
    })
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------
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
  imports: [StoreServiceModule, AppStorageServiceModule],
})
class UserServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { UserService, UserServiceDI, UserServiceModule }
