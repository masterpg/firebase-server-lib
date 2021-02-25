import { IdToken } from '../../../src/app/services'
import { TestUserInput } from '../../../src/app/services'
import { cloneDeep } from 'lodash'
import dayjs = require('dayjs')

export function GeneralUser(): Required<Omit<TestUserInput, 'readableNodeId' | 'writableNodeId'>> {
  return cloneDeep(
    ((GeneralUser as any).instance = (GeneralUser as any).instance || {
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
    })
  )
}

export function GeneralUserToken(): IdToken {
  const now = dayjs()
  return cloneDeep(
    ((GeneralUserToken as any).instance = (GeneralUserToken as any).instance || {
      aud: 'my-app-1234',
      auth_time: now.unix(),
      email: GeneralUser().email,
      email_verified: GeneralUser().emailVerified,
      exp: now.add(1, 'hour').unix(),
      firebase: {
        identities: {
          email: [GeneralUser().email],
        },
        sign_in_provider: 'custom',
      },
      iat: now.unix(),
      iss: 'https://securetoken.google.com/my-app-1234',
      sub: GeneralUser().uid,
      uid: GeneralUser().uid,
      authStatus: GeneralUser().authStatus,
      isAppAdmin: GeneralUser().isAppAdmin,
    })
  )
}

export function GeneralUserHeader() {
  return { Authorization: `Bearer ${JSON.stringify(GeneralUserToken())}` }
}

export function AppAdminUser(): Required<Omit<TestUserInput, 'readableNodeId' | 'writableNodeId'>> {
  return cloneDeep(
    ((AppAdminUser as any).instance = (AppAdminUser as any).instance || {
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
    })
  )
}

export function AppAdminUserToken(): IdToken {
  const now = dayjs()
  return cloneDeep(
    ((AppAdminUserToken as any).instance = (AppAdminUserToken as any).instance || {
      aud: 'my-app-1234',
      auth_time: now.unix(),
      email: AppAdminUser().email,
      email_verified: AppAdminUser().emailVerified,
      exp: now.add(1, 'hour').unix(),
      firebase: {
        identities: {
          email: [AppAdminUser().email],
        },
        sign_in_provider: 'custom',
      },
      iat: now.unix(),
      iss: 'https://securetoken.google.com/my-app-1234',
      sub: AppAdminUser().uid,
      uid: AppAdminUser().uid,
      authStatus: AppAdminUser().authStatus,
      isAppAdmin: AppAdminUser().isAppAdmin,
    })
  )
}

export function AppAdminUserHeader() {
  return { Authorization: `Bearer ${JSON.stringify(AppAdminUserToken())}` }
}

export function StorageUser(): Required<Omit<TestUserInput, 'readableNodeId' | 'writableNodeId'>> {
  return cloneDeep(
    ((StorageUser as any).instance = (StorageUser as any).instance || {
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
    })
  )
}

export function StorageUserToken(): IdToken {
  const now = dayjs()
  return cloneDeep(
    ((StorageUserToken as any).instance = (StorageUserToken as any).instance || {
      aud: 'my-app-1234',
      auth_time: now.unix(),
      email: StorageUser().email,
      email_verified: StorageUser().emailVerified,
      exp: now.add(1, 'hour').unix(),
      firebase: {
        identities: {
          email: [StorageUser().email],
        },
        sign_in_provider: 'custom',
      },
      iat: now.unix(),
      iss: 'https://securetoken.google.com/my-app-1234',
      sub: StorageUser().uid,
      uid: StorageUser().uid,
      authStatus: StorageUser().authStatus,
      isAppAdmin: StorageUser().isAppAdmin,
    })
  )
}

export function StorageUserHeader() {
  return { Authorization: `Bearer ${JSON.stringify(StorageUserToken())}` }
}
