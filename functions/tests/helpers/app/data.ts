import { AuthStatus, UserIdClaims } from '../../../src/app/services'
import { TestUserInput } from '../../../src/app/services'

export function GeneralUser(): Required<TestUserInput> {
  return {
    uid: 'test.general',
    email: 'test.general@example.com',
    emailVerified: true,
    password: 'passpass',
    displayName: '一般テストユーザー',
    disabled: false,
    customClaims: { authStatus: AuthStatus.Available },
    fullName: '一般 太郎',
    photoURL: 'https://example.com/test.general/user.png',
  }
}

export function GeneralUserToken(): UserIdClaims {
  return {
    uid: GeneralUser().uid,
    ...GeneralUser().customClaims,
  }
}

export function GeneralUserHeader() {
  return {
    Authorization: `Bearer ${JSON.stringify(GeneralUserToken())}`,
  }
}

export function AppAdminUser(): Required<TestUserInput> {
  return {
    uid: 'test.app.admin',
    email: 'test.app.admin@example.com',
    emailVerified: true,
    password: 'passpass',
    displayName: 'アプリケーション管理テストユーザー',
    disabled: false,
    customClaims: { authStatus: AuthStatus.Available, isAppAdmin: true },
    fullName: '管理 太郎',
    photoURL: 'https://example.com/test.app.admin/user.png',
  }
}

export function AppAdminUserToken(): UserIdClaims {
  return {
    uid: AppAdminUser().uid,
    ...AppAdminUser().customClaims,
  }
}

export function AppAdminUserHeader() {
  return {
    Authorization: `Bearer ${JSON.stringify(AppAdminUserToken())}`,
  }
}

export function StorageUser(): Required<TestUserInput> {
  return {
    uid: 'test.storage',
    email: 'test.storage@example.com',
    emailVerified: true,
    password: 'passpass',
    displayName: 'ストレージテストユーザー',
    disabled: false,
    customClaims: { authStatus: AuthStatus.Available },
    fullName: '貯蔵 太郎',
    photoURL: 'https://example.com/test.storage/user.png',
  }
}

export function StorageUserToken(): UserIdClaims {
  return {
    uid: StorageUser().uid,
    ...StorageUser().customClaims,
  }
}

export function StorageUserHeader() {
  return {
    Authorization: `Bearer ${JSON.stringify(StorageUserToken())}`,
  }
}
