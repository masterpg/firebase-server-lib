import { UserIdClaims } from '../../../src/lib/nest'

export const GENERAL_USER: UserIdClaims = {
  uid: 'test.general',
  myDirName: 'test.general',
}

export const GENERAL_USER_HEADER = {
  Authorization: `Bearer ${JSON.stringify(GENERAL_USER)}`,
}

export const APP_ADMIN_USER: UserIdClaims = {
  uid: 'test.app.admin',
  myDirName: 'test.app.admin',
  isAppAdmin: true,
}

export const APP_ADMIN_USER_HEADER = {
  Authorization: `Bearer ${JSON.stringify(APP_ADMIN_USER)}`,
}

export const STORAGE_USER: UserIdClaims = {
  uid: 'test.storage',
  myDirName: 'test.storage',
}

export const STORAGE_USER_HEADER = {
  Authorization: `Bearer ${JSON.stringify(STORAGE_USER)}`,
}
