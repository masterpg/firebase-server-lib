#!/usr/bin/env node

import { DevUtilsServiceDI, DevUtilsServiceModule, TestUserInput } from '../lib'
import { createNestApplication } from '../example/base'
import { initFirebaseApp } from '../lib/base'
const exitHook = require('async-exit-hook')
exitHook.forceExitTimeout(60000)

const users: TestUserInput[] = [
  {
    uid: 'general',
    email: 'general@example.com',
    emailVerified: true,
    password: 'passpass',
    displayName: '一般ユーザー',
    fullName: '一般 太郎',
    disabled: false,
    customClaims: {},
  },
  {
    uid: 'app.admin',
    email: 'app.admin@example.com',
    emailVerified: true,
    password: 'passpass',
    displayName: 'アプリケーション管理ユーザー',
    fullName: '管理 太郎',
    disabled: false,
    customClaims: { isAppAdmin: true },
  },
]

exitHook((callback: () => void) => {
  initFirebaseApp()

  createNestApplication(DevUtilsServiceModule).then(async nestApp => {
    const devUtilsService = nestApp.get(DevUtilsServiceDI.symbol) as DevUtilsServiceDI.type
    await devUtilsService.setTestUsers(...users)
    callback()
  })
})
