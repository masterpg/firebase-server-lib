#!/usr/bin/env node

import * as admin from 'firebase-admin'
import { initFirebaseApp } from '../lib'
import UserRecord = admin.auth.UserRecord
const exitHook = require('async-exit-hook')
exitHook.forceExitTimeout(60000)

const users = [
  {
    uid: 'general.user',
    email: 'general.user@example.com',
    emailVerified: true,
    password: 'passpass',
    displayName: '一般ユーザー',
    disabled: false,
    customUserClaims: { storageDir: 'general.user' },
  },
  {
    uid: 'app.admin.user',
    email: 'app.admin.user@example.com',
    emailVerified: true,
    password: 'passpass',
    displayName: 'アプリケーション管理ユーザー',
    disabled: false,
    customUserClaims: { storageDir: 'app.admin.user', isAppAdmin: true },
  },
  {
    uid: 'storage.test.user',
    email: 'storage.test.user@example.com',
    emailVerified: true,
    password: 'passpass',
    displayName: 'ストレージテストユーザー',
    disabled: false,
    customUserClaims: {},
  },
]

exitHook((callback: () => void) => {
  initFirebaseApp()

  const promises: Promise<void>[] = []
  for (const userData of users) {
    promises.push(
      (async () => {
        // 既存ユーザーを取得
        let existingUser: UserRecord | undefined = undefined
        try {
          existingUser = await admin.auth().getUser(userData.uid)
        } catch (e) {
          // 存在しないuidでgetUser()するとエラーが発生するのでtry-catchしている
        }

        // 既にユーザーが存在する場合は削除
        if (existingUser) {
          await admin.auth().deleteUser(existingUser.uid)
        }

        // ユーザーの追加
        await admin.auth().createUser(userData)

        // カスタムクレームの設定
        await admin.auth().setCustomUserClaims(userData.uid, userData.customUserClaims)
      })()
    )
  }

  Promise.all(promises).then(() => {
    callback()
  })
})
