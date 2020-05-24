#!/usr/bin/env node

import { DevUtilsServiceDI, DevUtilsServiceModule, TestFirebaseUserInput } from '../lib/services'
import { createNestApplication } from '../example/base'
import { initFirebaseApp } from '../lib/base'
const exitHook = require('async-exit-hook')
exitHook.forceExitTimeout(60000)

const users: TestFirebaseUserInput[] = [
  {
    uid: 'general',
    email: 'general@example.com',
    emailVerified: true,
    password: 'passpass',
    displayName: '一般ユーザー',
    disabled: false,
    customClaims: { myDirName: 'general' },
  },
  {
    uid: 'app.admin',
    email: 'app.admin@example.com',
    emailVerified: true,
    password: 'passpass',
    displayName: 'アプリケーション管理ユーザー',
    disabled: false,
    customClaims: { myDirName: 'app.admin', isAppAdmin: true },
  },
  {
    uid: 'test.general',
    email: 'test.general@example.com',
    emailVerified: true,
    password: 'passpass',
    displayName: '一般テストユーザー',
    disabled: false,
    customClaims: { myDirName: 'test.general' },
  },
  {
    uid: 'test.app.admin',
    email: 'test.app.admin@example.com',
    emailVerified: true,
    password: 'passpass',
    displayName: 'アプリケーション管理テストユーザー',
    disabled: false,
    customClaims: { myDirName: 'test.app.admin', isAppAdmin: true },
  },
  {
    uid: 'test.storage',
    email: 'test.storage@example.com',
    emailVerified: true,
    password: 'passpass',
    displayName: 'ストレージテストユーザー',
    disabled: false,
    customClaims: { myDirName: 'test.storage' },
  },
]

exitHook((callback: () => void) => {
  initFirebaseApp()

  createNestApplication(DevUtilsServiceModule).then(async nestApp => {
    const devUtilsService = nestApp.get(DevUtilsServiceDI.symbol) as DevUtilsServiceDI.type
    await devUtilsService.setTestFirebaseUsers(...users)
    callback()
  })
})
