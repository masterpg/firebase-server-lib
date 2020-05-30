import { AuthStatus, TestUserInput, UserIdClaims } from '../../../src/lib'

export const GENERAL_USER: Required<TestUserInput> = {
  uid: 'test.general',
  email: 'test.general@example.com',
  emailVerified: true,
  password: 'passpass',
  displayName: '一般テストユーザー',
  disabled: false,
  customClaims: { authStatus: AuthStatus.Available, myDirName: 'test.general' },
  fullName: '一般 太郎',
  photoURL: 'https://example.com/test.general/user.png',
}

export const GENERAL_USER_TOKEN: UserIdClaims = {
  uid: GENERAL_USER.uid,
  ...GENERAL_USER.customClaims,
}

export const GENERAL_USER_HEADER = {
  Authorization: `Bearer ${JSON.stringify(GENERAL_USER_TOKEN)}`,
}

export const APP_ADMIN_USER: Required<TestUserInput> = {
  uid: 'test.app.admin',
  email: 'test.app.admin@example.com',
  emailVerified: true,
  password: 'passpass',
  displayName: 'アプリケーション管理テストユーザー',
  disabled: false,
  customClaims: { authStatus: AuthStatus.Available, myDirName: 'test.app.admin', isAppAdmin: true },
  fullName: '管理 太郎',
  photoURL: 'https://example.com/test.app.admin/user.png',
}

export const APP_ADMIN_USER_TOKEN: UserIdClaims = {
  uid: APP_ADMIN_USER.uid,
  ...APP_ADMIN_USER.customClaims,
}

export const APP_ADMIN_USER_HEADER = {
  Authorization: `Bearer ${JSON.stringify(APP_ADMIN_USER_TOKEN)}`,
}

export const STORAGE_USER: Required<TestUserInput> = {
  uid: 'test.storage',
  email: 'test.storage@example.com',
  emailVerified: true,
  password: 'passpass',
  displayName: 'ストレージテストユーザー',
  disabled: false,
  customClaims: { authStatus: AuthStatus.Available, myDirName: 'test.storage' },
  fullName: '貯蔵 太郎',
  photoURL: 'https://example.com/test.storage/user.png',
}

export const STORAGE_USER_TOKEN: UserIdClaims = {
  uid: STORAGE_USER.uid,
  ...STORAGE_USER.customClaims,
}

export const STORAGE_USER_HEADER = {
  Authorization: `Bearer ${JSON.stringify(STORAGE_USER_TOKEN)}`,
}
