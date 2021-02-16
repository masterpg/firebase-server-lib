import { AuthStatus, UserIdClaims } from '../../../src/app/services'
import { TestUserInput } from '../../../src/app/services'

export function GeneralUser(): Required<Omit<TestUserInput, 'readableNodeId' | 'writableNodeId'>> {
  return {
    uid: 'test.general',
    email: 'test.general@example.com',
    emailVerified: true,
    password: 'passpass',
    disabled: false,
    userName: 'test.general',
    fullName: '一般 太郎',
    authStatus: 'Available',
    isAppAdmin: false,
    photoURL: 'https://example.com/test.general/user.png',
  }
}

export function GeneralUserToken(): UserIdClaims {
  return {
    uid: GeneralUser().uid,
    isAppAdmin: GeneralUser().isAppAdmin,
    authStatus: GeneralUser().authStatus,
  }
}

export function GeneralUserHeader() {
  return {
    Authorization: `Bearer ${JSON.stringify(GeneralUserToken())}`,
  }
}

export function AppAdminUser(): Required<Omit<TestUserInput, 'readableNodeId' | 'writableNodeId'>> {
  return {
    uid: 'test.app.admin',
    email: 'test.app.admin@example.com',
    emailVerified: true,
    password: 'passpass',
    disabled: false,
    userName: 'test.app.admin',
    fullName: '管理 太郎',
    authStatus: 'Available',
    isAppAdmin: true,
    photoURL: 'https://example.com/test.app.admin/user.png',
  }
}

export function AppAdminUserToken(): UserIdClaims {
  return {
    uid: AppAdminUser().uid,
    authStatus: AppAdminUser().authStatus,
    isAppAdmin: AppAdminUser().isAppAdmin,
  }
}

export function AppAdminUserHeader() {
  return {
    Authorization: `Bearer ${JSON.stringify(AppAdminUserToken())}`,
  }
}

export function StorageUser(): Required<Omit<TestUserInput, 'readableNodeId' | 'writableNodeId'>> {
  return {
    uid: 'test.storage',
    email: 'test.storage@example.com',
    emailVerified: true,
    password: 'passpass',
    disabled: false,
    userName: 'test.storage',
    fullName: '貯蔵 太郎',
    authStatus: 'Available',
    isAppAdmin: false,
    photoURL: 'https://example.com/test.storage/user.png',
  }
}

export function StorageUserToken(): UserIdClaims {
  return {
    uid: StorageUser().uid,
    authStatus: StorageUser().authStatus,
    isAppAdmin: StorageUser().isAppAdmin,
  }
}

export function StorageUserHeader() {
  return {
    Authorization: `Bearer ${JSON.stringify(StorageUserToken())}`,
  }
}
