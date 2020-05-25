import * as admin from 'firebase-admin'
import {
  AuthStatus,
  DevUtilsServiceDI,
  DevUtilsServiceModule,
  StorageServiceDI,
  StoreServiceDI,
  TestFirebaseUserInput,
  User,
  UserInfoInput,
  UserServiceDI,
} from '../../../../../src/lib/services'
import GQLContainerModule from '../../../../../src/example/gql/gql.module'
import { Test } from '@nestjs/testing'
import { initLib } from '../../../../../src/lib/base'

jest.setTimeout(25000)
initLib()

//========================================================================
//
//  Test helpers
//
//========================================================================

let userService!: UserServiceDI.type
let storeService!: StoreServiceDI.type
let storageService!: StorageServiceDI.type
let devUtilsService!: DevUtilsServiceDI.type

const NOT_VERIFIED_USER: TestFirebaseUserInput = {
  uid: 'ichiro',
  email: 'ichiro@example.com',
  emailVerified: false,
  password: 'passpass',
  disabled: false,
  photoURL: 'https://example.com/ichiro/user.png',
}

const VERIFIED_USER: TestFirebaseUserInput = {
  uid: 'jiro',
  email: 'jiro@example.com',
  emailVerified: true,
  password: 'passpass',
  disabled: false,
  photoURL: 'https://example.com/jiro/user.png',
  customClaims: {
    isAppAdmin: true,
  },
}

const AVAILABLE_USER: TestFirebaseUserInput = {
  uid: 'saburo',
  email: 'saburo@example.com',
  emailVerified: true,
  password: 'passpass',
  disabled: false,
  photoURL: 'https://example.com/saburo/user.png',
  customClaims: {
    isAppAdmin: true,
    myDirName: 'saburo',
  },
}

const AVAILABLE_USER_INPUT: UserInfoInput = {
  fullName: '鈴木 三郎',
  displayName: 'サブロー',
}

const USERS = [NOT_VERIFIED_USER, VERIFIED_USER, AVAILABLE_USER]

//========================================================================
//
//  Tests
//
//========================================================================

beforeAll(async () => {
  const testingModule = await Test.createTestingModule({
    imports: [GQLContainerModule, DevUtilsServiceModule],
  }).compile()
  userService = testingModule.get<UserServiceDI.type>(UserServiceDI.symbol)
  storeService = testingModule.get<StoreServiceDI.type>(StoreServiceDI.symbol)
  storageService = testingModule.get<StorageServiceDI.type>(StorageServiceDI.symbol)
  devUtilsService = testingModule.get<DevUtilsServiceDI.type>(DevUtilsServiceDI.symbol)
})

afterAll(async () => {
  await devUtilsService.deleteTestUsers(...USERS.map(user => user.uid))
})

/**
 * TODO Jest did not exit one second after the test run has completed.
 *  admin.auth()の非同期メソッド`getUser()`などを実行すると上記警告が発生しJestが終了しない
 */
describe('UserService', () => {
  describe('getAuthData', () => {
    beforeAll(async () => {
      for (const user of USERS) {
        await userService.deleteUser(user.uid)
      }
      for (const user of USERS) {
        await devUtilsService.setTestFirebaseUsers(user)
      }
      await userService.setUserInfo(AVAILABLE_USER.uid, AVAILABLE_USER_INPUT)
    })

    it('メールアドレス確認待ちユーザーの場合', async () => {
      const actual = await userService.getAuthData(NOT_VERIFIED_USER.uid)

      expect(actual.status).toBe(AuthStatus.WaitForEmailVerified)
      expect(actual.token.length > 0).toBeTruthy()
      expect(actual.user).toBeUndefined()
    })

    it('メールアドレス確認済みユーザーの場合', async () => {
      const actual = await userService.getAuthData(VERIFIED_USER.uid)

      expect(actual.status).toBe(AuthStatus.WaitForEntry)
      expect(actual.token.length > 0).toBeTruthy()
      expect(actual.user).toBeUndefined()
    })

    it('登録済みユーザーの場合', async () => {
      const actual = await userService.getAuthData(AVAILABLE_USER.uid)

      expect(actual.status).toBe(AuthStatus.Available)
      expect(actual.token.length > 0).toBeTruthy()
      expect(actual.user).toMatchObject({
        id: AVAILABLE_USER.uid,
        fullName: AVAILABLE_USER_INPUT.fullName,
        email: AVAILABLE_USER.email,
        emailVerified: AVAILABLE_USER.emailVerified,
        isAppAdmin: AVAILABLE_USER.customClaims?.isAppAdmin,
        myDirName: AVAILABLE_USER.customClaims?.myDirName,
        publicProfile: {
          displayName: AVAILABLE_USER_INPUT.displayName,
          photoURL: AVAILABLE_USER.photoURL,
        },
      } as User)
    })

    it('存在しないユーザーを指定した場合', async () => {
      await expect(userService.getAuthData('hogehoge')).rejects.toThrow('There is no user: {"uid":"hogehoge"}')
    })
  })

  describe('setUserInfo', () => {
    beforeEach(async () => {
      await userService.deleteUser(VERIFIED_USER.uid)
      await devUtilsService.setTestFirebaseUsers(VERIFIED_USER)
    })

    it('ユーザー情報の追加', async () => {
      const actual = await userService.setUserInfo(VERIFIED_USER.uid, {
        fullName: '鈴木 二郎',
        displayName: 'ジロー',
      })

      // 戻り値の検証
      const fetched = (await userService.getUser(VERIFIED_USER.uid))!
      expect(actual).toEqual(fetched)
      expect(actual).toMatchObject({
        id: VERIFIED_USER.uid,
        fullName: '鈴木 二郎',
        email: VERIFIED_USER.email,
        emailVerified: VERIFIED_USER.emailVerified,
        isAppAdmin: VERIFIED_USER.customClaims?.isAppAdmin,
        publicProfile: {
          displayName: 'ジロー',
          photoURL: VERIFIED_USER.photoURL,
        },
      } as User)
      // ユーザーディレクトリが作成されたことを検証
      expect(actual.myDirName.length > 0).toBeTruthy()
      const userDirPath = storageService.getUserDirPath({ uid: fetched.id, ...fetched })
      const userDir = await storageService.getRealDirNode(null, userDirPath)
      expect(userDir.exists).toBeTruthy()
      // タイムスタンプの検証
      expect(actual.createdAt.isValid()).toBeTruthy()
      expect(actual.updatedAt.isValid()).toBeTruthy()
      expect(actual.publicProfile.createdAt.isValid()).toBeTruthy()
      expect(actual.publicProfile.updatedAt.isValid()).toBeTruthy()
    })

    it('ユーザー情報の更新', async () => {
      // ユーザー追加
      const added = await userService.setUserInfo(VERIFIED_USER.uid, {
        fullName: '鈴木 二郎',
        displayName: 'ジロー',
      })

      // ユーザー更新
      const actual = await userService.setUserInfo(VERIFIED_USER.uid, {
        fullName: 'Jiro Suzuki',
        displayName: 'Jiro',
      })

      // 戻り値の検証
      const fetched = await userService.getUser(VERIFIED_USER.uid)
      expect(actual).toEqual(fetched)
      expect(actual).toMatchObject({
        fullName: 'Jiro Suzuki',
        publicProfile: {
          displayName: 'Jiro',
        },
        // 追加時と変わっていないことを検証
        myDirName: added.myDirName,
        isAppAdmin: added.isAppAdmin,
      } as User)
      // タイムスタンプの検証
      expect(actual.createdAt).toEqual(added.createdAt)
      expect(actual.updatedAt.isAfter(added.updatedAt)).toBeTruthy()
      expect(actual.publicProfile.createdAt).toEqual(added.publicProfile.createdAt)
      expect(actual.publicProfile.updatedAt.isAfter(added.publicProfile.updatedAt)).toBeTruthy()
    })

    it('存在しないユーザーを指定した場合', async () => {
      let actual!: Error
      try {
        const actual = await userService.setUserInfo('hogehoge', {
          fullName: 'ほげ ほげ',
          displayName: 'HogeHoge',
        })
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe('There is no user: {"uid":"hogehoge"}')
    })
  })

  describe('deleteUser', () => {
    beforeEach(async () => {
      await userService.deleteUser(VERIFIED_USER.uid)
      await devUtilsService.setTestFirebaseUsers(VERIFIED_USER)
    })

    it('ユーザーの削除', async () => {
      // ユーザー追加
      const added = await userService.setUserInfo(VERIFIED_USER.uid, {
        fullName: '鈴木 二郎',
        displayName: 'ジロー',
      })

      // ユーザーディレクトリパスを取得
      const userDirPath = storageService.getUserDirPath({ uid: added.id, ...added })
      let userDir = await storageService.getRealDirNode(null, userDirPath)
      expect(userDir.exists).toBeTruthy()

      // ユーザー削除
      await userService.deleteUser(VERIFIED_USER.uid)

      // Firestoreのユーザーが削除されたことを検証
      await expect(admin.auth().getUser(VERIFIED_USER.uid)).rejects.toThrow('There is no user record corresponding to the provided identifier.')
      // Firestoreのユーザー情報が削除されたことを検証
      const storeUser = await storeService.userDao.fetch(VERIFIED_USER.uid)
      expect(storeUser).toBeUndefined()
      const publicProfile = await storeService.publicProfileDao.fetch(VERIFIED_USER.uid)
      expect(publicProfile).toBeUndefined()
      // ユーザーディレクトリが削除されたことを検証
      userDir = await storageService.getRealDirNode(null, userDirPath)
      expect(userDir.exists).toBeFalsy()
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
  })
})
