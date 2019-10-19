#!/usr/bin/env node

import * as admin from 'firebase-admin'
import { initFirebaseApp } from '../base/firebase'
const exitHook = require('async-exit-hook')

const users = [
  {
    uid: 'yamada.one',
    email: 'yamada.one@example.com',
    emailVerified: true,
    password: 'passpass',
    displayName: '山田 一郎',
    disabled: false,
  },
  {
    uid: 'kanri.one',
    email: 'kanri.one@example.com',
    emailVerified: true,
    password: 'passpass',
    displayName: '管理 一郎',
    disabled: false,
    customUserClaims: { isAppAdmin: true },
  },
]

exitHook((callback: () => void) => {
  initFirebaseApp()

  const promises: Promise<void>[] = []
  for (const user of users) {
    promises.push(
      (async () => {
        // 既にユーザーが存在する場合は削除
        try {
          const existUser = await admin.auth().getUser(user.uid)
          await admin.auth().deleteUser(existUser.uid)
        } catch (e) {
          // 存在しないuidでgetUser()するとエラーが発生するのでtry-catchしている
        }
        // ユーザーの追加
        try {
          await admin.auth().createUser(user)
          if (user.customUserClaims) {
            await admin.auth().setCustomUserClaims(user.uid, user.customUserClaims)
          }
        } catch (err) {
          console.error(`${user.email}:`, err)
        }
      })()
    )
  }

  Promise.all(promises).then(() => {
    callback()
  })
})
