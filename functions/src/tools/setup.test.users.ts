#!/usr/bin/env node

import * as admin from 'firebase-admin'
import { initFirebaseApp } from '../lib'
import UserRecord = admin.auth.UserRecord
const exitHook = require('async-exit-hook')
exitHook.forceExitTimeout(60000)

const users = [
  {
    uid: 'yamada.one',
    email: 'yamada.one@example.com',
    emailVerified: true,
    password: 'passpass',
    displayName: '山田 一郎',
    disabled: false,
    customUserClaims: { storageDir: 'yamada.one' },
  },
  {
    uid: 'kanri.one',
    email: 'kanri.one@example.com',
    emailVerified: true,
    password: 'passpass',
    displayName: '管理 一郎',
    disabled: false,
    customUserClaims: { storageDir: 'kanri.one', isAppAdmin: true },
  },
  {
    uid: 'storage.one',
    email: 'storage.one@example.com',
    emailVerified: true,
    password: 'passpass',
    displayName: '保管 一郎',
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
