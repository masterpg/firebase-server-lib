import * as td from 'testdouble'
import { AppAdminUserToken, GeneralUserToken } from '../../../../helpers/app'
import { AppError, initApp } from '../../../../../src/app/base'
import {
  AuthStatus,
  DevUtilsServiceDI,
  DevUtilsServiceModule,
  IdToken,
  SetUserInfoResultStatus,
  TestUserInput,
  User,
  UserClaims,
  UserHelper,
  UserSchema,
  UserService,
  UserServiceDI,
  UserServiceModule,
} from '../../../../../src/app/services'
import { HttpException } from '@nestjs/common/exceptions/http.exception'
import { Test } from '@nestjs/testing'
import { cloneDeep } from 'lodash'
import { newElasticClient } from '../../../../../src/app/base/elastic'
import dayjs = require('dayjs')

jest.setTimeout(25000)
initApp()

//========================================================================
//
//  Test data
//
//========================================================================

function NotVerifiedUser(): TestUserInput {
  return cloneDeep(
    ((NotVerifiedUser as any).instance = (NotVerifiedUser as any).instance || {
      uid: 'ichiro',
      email: 'ichiro@example.com',
      emailVerified: false,
      password: 'passpass',
      disabled: false,
      userName: 'ichiro',
      fullName: '鈴木 一郎',
      photoURL: 'https://example.com/ichiro/user.png',
    })
  )
}

function VerifiedUser(): TestUserInput {
  return cloneDeep(
    ((VerifiedUser as any).instance = (VerifiedUser as any).instance || {
      uid: 'jiro',
      email: 'jiro@example.com',
      emailVerified: true,
      password: 'passpass',
      disabled: false,
      userName: 'jiro',
      fullName: '鈴木 二郎',
      photoURL: 'https://example.com/jiro/user.png',
      isAppAdmin: true,
    })
  )
}

function VerifiedUserToken(): IdToken {
  const now = dayjs()
  return cloneDeep(
    ((VerifiedUserToken as any).instance = (VerifiedUserToken as any).instance || {
      aud: 'my-app-1234',
      auth_time: now.unix(),
      email: VerifiedUser().email,
      email_verified: VerifiedUser().emailVerified,
      exp: now.add(1, 'hour').unix(),
      firebase: {
        identities: {
          email: [VerifiedUser().email],
        },
        sign_in_provider: 'custom',
      },
      iat: now.unix(),
      iss: 'https://securetoken.google.com/my-app-1234',
      sub: VerifiedUser().uid,
      uid: VerifiedUser().uid,
      authStatus: VerifiedUser().authStatus,
      isAppAdmin: VerifiedUser().isAppAdmin,
    })
  )
}

function AvailableUser(): TestUserInput {
  return cloneDeep(
    ((AvailableUser as any).instance = (AvailableUser as any).instance || {
      uid: 'saburo',
      email: 'saburo@example.com',
      emailVerified: true,
      password: 'passpass',
      disabled: false,
      userName: 'saburo',
      fullName: '鈴木 三郎',
      photoURL: 'https://example.com/saburo/user.png',
      isAppAdmin: true,
    })
  )
}

function DeleteUser1(): TestUserInput {
  return cloneDeep(
    ((DeleteUser1 as any).instance = (DeleteUser1 as any).instance || {
      uid: 'delete-user-1',
      email: 'delete-user-1@example.com',
      emailVerified: true,
      password: 'passpass',
      disabled: false,
      userName: 'delete-user-1',
      fullName: '削除 太郎',
      photoURL: 'https://example.com/delete-user-1/user.png',
      isAppAdmin: true,
    })
  )
}

function DeleteUser1Token(): IdToken {
  const now = dayjs()
  return cloneDeep(
    ((DeleteUser1Token as any).instance = (DeleteUser1Token as any).instance || {
      aud: 'my-app-1234',
      auth_time: now.unix(),
      email: DeleteUser1().email,
      email_verified: DeleteUser1().emailVerified,
      exp: now.add(1, 'hour').unix(),
      firebase: {
        identities: {
          email: [DeleteUser1().email],
        },
        sign_in_provider: 'custom',
      },
      iat: now.unix(),
      iss: 'https://securetoken.google.com/my-app-1234',
      sub: DeleteUser1().uid,
      uid: DeleteUser1().uid,
      authStatus: DeleteUser1().authStatus,
      isAppAdmin: DeleteUser1().isAppAdmin,
    })
  )
}

function JiroYamada(): TestUserInput {
  return cloneDeep(
    ((JiroYamada as any).instance = (JiroYamada as any).instance || {
      uid: 'jiro.yamada',
      email: 'jiro.yamada@example.com',
      emailVerified: false,
      password: 'passpass',
      disabled: false,
      userName: VerifiedUser().userName,
      fullName: '山田 二郎',
      photoURL: 'https://example.com/jiro.yamada/user.png',
      isAppAdmin: false,
    })
  )
}

const Users = [NotVerifiedUser(), VerifiedUser(), AvailableUser(), DeleteUser1(), JiroYamada()]

//========================================================================
//
//  Test helpers
//
//========================================================================

type UserTestService = UserService

async function removeAllDBUsers(): Promise<void> {
  const client = newElasticClient()
  await client.deleteByQuery({
    index: UserSchema.IndexAlias,
    body: {
      query: {
        match_all: {},
      },
    },
    refresh: true,
  })
}

//========================================================================
//
//  Tests
//
//========================================================================

/**
 * TODO Jest did not exit one second after the test run has completed.
 *  admin.auth()の非同期メソッド`getUser()`などを実行すると上記警告が発生しJestが終了しない
 */
describe('UserService', () => {
  let userService!: UserTestService
  let devUtilsService!: DevUtilsServiceDI.type

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [UserServiceModule, DevUtilsServiceModule],
    }).compile()

    userService = testingModule.get<UserServiceDI.type>(UserServiceDI.symbol)
    devUtilsService = testingModule.get<DevUtilsServiceDI.type>(DevUtilsServiceDI.symbol)
  })

  afterAll(async () => {
    await devUtilsService.deleteTestUsers(...Users.map(user => user.uid))
  })

  afterEach(() => {
    td.reset()
  })

  describe('getAuthData', () => {
    beforeAll(async () => {
      await devUtilsService.setTestFirebaseUsers(...Users)
      await userService.setUserInfo(AvailableUser().uid, AvailableUser())
    })

    it('メールアドレス確認待ちユーザーの場合', async () => {
      const actual = await userService.getAuthData(NotVerifiedUser().uid)

      expect(actual.status).toBe<AuthStatus>('WaitForEmailVerified')
      expect(actual.token.length > 0).toBeTruthy()
      expect(actual.user).toBeUndefined()

      const userRecord = await UserHelper.getUserRecord(NotVerifiedUser().uid)
      const userClaims = userRecord.customClaims as UserClaims
      expect(userClaims.authStatus).toBe<AuthStatus>('WaitForEmailVerified')
    })

    it('メールアドレス確認済みユーザーの場合', async () => {
      const actual = await userService.getAuthData(VerifiedUser().uid)

      expect(actual.status).toBe<AuthStatus>('WaitForEntry')
      expect(actual.token.length > 0).toBeTruthy()
      expect(actual.user).toBeUndefined()

      const userRecord = await UserHelper.getUserRecord(VerifiedUser().uid)
      const userClaims = userRecord.customClaims as UserClaims
      expect(userClaims.authStatus).toBe<AuthStatus>('WaitForEntry')
    })

    it('登録済みユーザーの場合', async () => {
      const actual = await userService.getAuthData(AvailableUser().uid)

      expect(actual.status).toBe<AuthStatus>('Available')
      expect(actual.token.length > 0).toBeTruthy()
      expect(actual.user).toMatchObject({
        id: AvailableUser().uid,
        email: AvailableUser().email,
        emailVerified: AvailableUser().emailVerified,
        userName: AvailableUser().userName,
        fullName: AvailableUser().fullName,
        photoURL: AvailableUser().photoURL,
        isAppAdmin: AvailableUser().isAppAdmin,
      } as User)

      const userRecord = await UserHelper.getUserRecord(AvailableUser().uid)
      const userClaims = userRecord.customClaims as UserClaims
      expect(userClaims.authStatus).toBe<AuthStatus>('Available')
    })

    it('存在しないユーザーを指定した場合', async () => {
      await expect(userService.getAuthData('hogehoge')).rejects.toThrow('There is no user: {"uid":"hogehoge"}')
    })
  })

  describe('setUserInfo', () => {
    beforeEach(async () => {
      await removeAllDBUsers()
      await devUtilsService.setTestFirebaseUsers(VerifiedUser(), JiroYamada())
    })

    it('IDトークン指定なし', async () => {
      const actual = await userService.setUserInfo(VerifiedUser().uid, {
        userName: VerifiedUser().userName,
        fullName: VerifiedUser().fullName,
        photoURL: VerifiedUser().photoURL,
      })

      expect(actual.status).toBe<SetUserInfoResultStatus>('Success')
    })

    describe('IDトークン指定あり', () => {
      it('自ユーザーの編集', async () => {
        const actual = await userService.setUserInfo(VerifiedUserToken(), VerifiedUser().uid, VerifiedUser())

        expect(actual.status).toBe<SetUserInfoResultStatus>('Success')
      })

      it('他ユーザーの編集 - 編集権限あり ', async () => {
        const actual = await userService.setUserInfo(AppAdminUserToken(), VerifiedUser().uid, VerifiedUser())

        expect(actual.status).toBe<SetUserInfoResultStatus>('Success')
      })

      it('他ユーザーの編集 - 編集権限なし', async () => {
        let actual!: AppError
        try {
          await userService.setUserInfo(GeneralUserToken(), VerifiedUser().uid, VerifiedUser())
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`An unauthorized user attempted to edit another user.`)
        expect(actual.data).toEqual({
          executor: {
            uid: GeneralUserToken().uid,
            email: GeneralUserToken().email,
            isAppAdmin: GeneralUserToken().isAppAdmin,
          },
          target: {
            uid: VerifiedUser().uid,
          },
        })
      })
    })

    it('ユーザー情報の追加', async () => {
      // ユーザー情報の追加
      const actual = await userService.setUserInfo(VerifiedUser().uid, {
        userName: VerifiedUser().userName,
        fullName: VerifiedUser().fullName,
        photoURL: VerifiedUser().photoURL,
      })

      // 戻り値の検証
      expect(actual.status).toBe<SetUserInfoResultStatus>('Success')
      const fetched = (await userService.getUser({ id: VerifiedUser().uid }))!
      expect(actual.user).toEqual(fetched)
      expect(actual.user).toMatchObject({
        id: VerifiedUser().uid,
        email: VerifiedUser().email,
        emailVerified: VerifiedUser().emailVerified,
        userName: VerifiedUser().userName,
        fullName: VerifiedUser().fullName,
        photoURL: VerifiedUser().photoURL,
        isAppAdmin: VerifiedUser().isAppAdmin,
      } as User)
      // タイムスタンプの検証
      expect(actual.user?.version).toBeGreaterThan(0)
      expect(actual.user?.createdAt.isValid()).toBeTruthy()
      expect(actual.user?.updatedAt.isValid()).toBeTruthy()
    })

    it('ユーザー情報の更新 - userNameを変更する', async () => {
      // ユーザー情報の追加
      const beforeUser = (await userService.setUserInfo(VerifiedUser().uid, VerifiedUser())).user!

      // ユーザー情報の更新
      const actual = await userService.setUserInfo(VerifiedUser().uid, {
        userName: 'Jiro.Suzuki', // 変更する
        fullName: 'Jiro Suzuki',
        photoURL: 'https://example.com/jiro.suzuki/user.png',
      })

      // 戻り値の検証
      expect(actual.status).toBe<SetUserInfoResultStatus>('Success')
      const fetched = await userService.getUser({ id: VerifiedUser().uid })
      expect(actual.user).toEqual(fetched)
      expect(actual.user).toMatchObject({
        userName: 'Jiro.Suzuki', // 変更されている
        fullName: 'Jiro Suzuki',
        photoURL: 'https://example.com/jiro.suzuki/user.png',
      } as User)
      // タイムスタンプの検証
      expect(actual.user?.version).toBe(beforeUser.version + 1)
      expect(actual.user?.createdAt).toEqual(beforeUser.createdAt)
      expect(actual.user?.updatedAt.isAfter(beforeUser.updatedAt)).toBeTruthy()
    })

    it('ユーザー情報の更新 - userNameを変更しない', async () => {
      // ユーザー情報の追加
      const beforeUser = (await userService.setUserInfo(VerifiedUser().uid, VerifiedUser())).user!

      // ユーザー情報の更新
      const actual = await userService.setUserInfo(VerifiedUser().uid, {
        userName: VerifiedUser().userName, // 変更しない
        fullName: 'Jiro Suzuki',
        photoURL: 'https://example.com/jiro.suzuki/user.png',
      })

      // 戻り値の検証
      expect(actual.status).toBe<SetUserInfoResultStatus>('Success')
      const fetched = await userService.getUser({ id: VerifiedUser().uid })
      expect(actual.user).toEqual(fetched)
      expect(actual.user).toMatchObject({
        userName: VerifiedUser().userName, // 変更されていない
        fullName: 'Jiro Suzuki',
        photoURL: 'https://example.com/jiro.suzuki/user.png',
      } as User)
      // タイムスタンプの検証
      expect(actual.user?.version).toBe(beforeUser.version + 1)
      expect(actual.user?.createdAt).toEqual(beforeUser.createdAt)
      expect(actual.user?.updatedAt.isAfter(beforeUser.updatedAt)).toBeTruthy()
    })

    it('同一ユーザー名のユーザーが既に存在する場合', async () => {
      // ユーザー情報の追加
      await userService.setUserInfo(VerifiedUser().uid, VerifiedUser())

      // 同一ユーザー名のユーザーの追加を試みる
      const actual = await userService.setUserInfo(JiroYamada().uid, {
        // 同一ユーザー名かつ大文字/小文字を区別しなことを検証するために大文字化して設定
        userName: VerifiedUser().userName.toUpperCase(),
        fullName: JiroYamada().fullName,
      })

      // 戻り値の検証
      expect(actual.status).toBe<SetUserInfoResultStatus>('AlreadyExists')
      expect(actual.user).toBeUndefined()
    })

    it('ユーザー名のバリデーション実行確認', async () => {
      const validateUserName = td.replace(UserService, 'validateUserName')

      await userService.setUserInfo(VerifiedUser().uid, {
        userName: VerifiedUser().userName,
        fullName: VerifiedUser().fullName,
        photoURL: VerifiedUser().photoURL,
      })

      const explanation = td.explain(validateUserName)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(VerifiedUser().userName)
    })

    it('フルネームのバリデーション実行確認', async () => {
      const validateFullName = td.replace(UserService, 'validateFullName')

      await userService.setUserInfo(VerifiedUser().uid, {
        userName: VerifiedUser().userName,
        fullName: VerifiedUser().fullName,
        photoURL: VerifiedUser().photoURL,
      })

      const explanation = td.explain(validateFullName)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(VerifiedUser().fullName)
    })

    it('サインインなしで実行しようとした場合', async () => {
      let actual!: HttpException
      try {
        // 第一引数に空が設定されると、サインインされていないと判断され、例外が発生する
        await userService.setUserInfo(undefined as any, VerifiedUser().uid, VerifiedUser())
      } catch (err) {
        actual = err
      }

      expect(actual.getStatus()).toBe(401)
    })
  })

  describe('deleteUser', () => {
    it('IDトークン指定なし', async () => {
      // ユーザー削除
      await userService.deleteUser(DeleteUser1().uid)

      // Firebaseのユーザーが削除されたことを検証
      await expect(UserHelper.getUserRecord(DeleteUser1().uid)).rejects.toThrow(new AppError(`There is no user.`, { uid: DeleteUser1().uid }))
      // データベースのユーザー情報が削除されたことを検証
      const dbUser = await userService.getUser({ id: DeleteUser1().uid })
      expect(dbUser).toBeUndefined()
    })

    describe('IDトークン指定あり', () => {
      it('自ユーザーの削除', async () => {
        // ユーザー削除
        await userService.deleteUser(DeleteUser1Token(), DeleteUser1().uid)

        // Firebaseのユーザーが削除されたことを検証
        await expect(UserHelper.getUserRecord(DeleteUser1().uid)).rejects.toThrow(new AppError(`There is no user.`, { uid: DeleteUser1().uid }))
        // データベースのユーザー情報が削除されたことを検証
        const dbUser = await userService.getUser({ id: DeleteUser1().uid })
        expect(dbUser).toBeUndefined()
      })

      it('他ユーザーの削除 - 削除権限あり', async () => {
        // ユーザー削除
        await userService.deleteUser(AppAdminUserToken(), DeleteUser1().uid)

        // Firebaseのユーザーが削除されたことを検証
        await expect(UserHelper.getUserRecord(DeleteUser1().uid)).rejects.toThrow(new AppError(`There is no user.`, { uid: DeleteUser1().uid }))
        // データベースのユーザー情報が削除されたことを検証
        const dbUser = await userService.getUser({ id: DeleteUser1().uid })
        expect(dbUser).toBeUndefined()
      })

      it('他ユーザーの削除 - 削除権限なし', async () => {
        let actual!: AppError
        try {
          await userService.deleteUser(GeneralUserToken(), DeleteUser1().uid)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`An unauthorized user attempted to delete another user.`)
        expect(actual.data).toEqual({
          executor: {
            uid: GeneralUserToken().uid,
            email: GeneralUserToken().email,
            isAppAdmin: GeneralUserToken().isAppAdmin,
          },
          target: {
            uid: DeleteUser1().uid,
          },
        })
      })
    })

    it('存在しないユーザーを指定した場合', async () => {
      let actual: Error | undefined
      try {
        await userService.deleteUser('hogehoge')
      } catch (err) {
        actual = err
      }

      // エラーが発生しないことを検証
      expect(actual).toBeUndefined()
    })

    it('サインインなしで実行しようとした場合', async () => {
      let actual!: HttpException
      try {
        // 第一引数に空が設定されると、サインインされていないと判断され、例外が発生する
        await userService.deleteUser(undefined as any, DeleteUser1().uid)
      } catch (err) {
        actual = err
      }

      expect(actual.getStatus()).toBe(401)
    })
  })

  describe('validateUserName', () => {
    it('ベーシックケース', async () => {
      UserService.validateUserName('aA0-_')
      expect(true)
    })

    it('undefinedを指定した場合', async () => {
      let actual!: AppError
      try {
        UserService.validateUserName(undefined)
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The specified 'userName' is empty.`)
    })

    it('60文字以上の場合', async () => {
      let actual!: AppError
      try {
        UserService.validateUserName('1234567890123456789012345678901234567890123456789012345678901')
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The specified 'userName' is invalid.`)
    })

    it('規定文字以外を指定した場合', async () => {
      let actual!: AppError
      try {
        UserService.validateUserName('山田\t太郎')
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The specified 'userName' is invalid.`)
    })
  })

  describe('validateFullName', () => {
    it('ベーシックケース', async () => {
      UserService.validateFullName('山田 太郎')
      expect(true)
    })

    it('60文字以上の場合', async () => {
      let actual!: AppError
      try {
        UserService.validateFullName('1234567890123456789012345678901234567890123456789012345678901')
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The specified 'fullName' is invalid.`)
    })

    it('禁則文字を使用している場合', async () => {
      const invalidChars = [`\n`, `\r`, `\r\n`, `\t`, '<', '>', '^', '*', '~', '　']
      for (const invalidChar of invalidChars) {
        const fullName = `山田${invalidChar}太郎`
        expect(() => {
          UserService.validateFullName(fullName)
        }).toThrow(new AppError(`The specified 'fullName' is invalid.`, { fullName }))
      }
    })
  })
})
