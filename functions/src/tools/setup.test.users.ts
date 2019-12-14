#!/usr/bin/env node

import * as admin from 'firebase-admin'
import { BaseStorageService } from '../lib'
import { initFirebaseApp } from '../lib'
import UserRecord = admin.auth.UserRecord
const exitHook = require('async-exit-hook')
exitHook.forceExitTimeout(60000)

const storageService = new (class extends BaseStorageService {})()

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
          // ユーザーディレクトリが削除されるまで待機
          await waitUserStorageDirRemoved(existingUser)
        }

        // ユーザーの追加
        await admin.auth().createUser(userData)
        // ユーザー追加によるCloud Functions実行で作成されたユーザーディレクトリを削除
        await removeUserStorageDir(userData.uid)

        // カスタムクレームの設定
        await admin.auth().setCustomUserClaims(userData.uid, userData.customUserClaims)

        // ユーザーディレクトリの作成
        const userRecord = await admin.auth().getUser(userData.uid)
        await storageService.assignUserDir(userRecord)
        console.log(`Created user's directory: ${userData.uid}, ${storageService.getUserDirPath(userRecord)}`)
      })()
    )
  }

  Promise.all(promises).then(() => {
    callback()
  })
})

/**
 * この関数ではCloud Functionsによるユーザーディレクトリの削除を監視し、
 * 削除されるまで待機します。
 *
 * ユーザーを削除するとCloud Functionsのイベントトリガーでユーザーディレクトリが
 * 削除されます。ただしユーザー削除からCloud Functionsの実行まで時間差があるので、
 * ユーザーディレクトリが削除されたことを判断することができません。
 * そこでこの関数ではユーザーディレクトリの削除を監視し、削除されるまで待機します。
 * @param user
 */
async function waitUserStorageDirRemoved(user: UserRecord): Promise<void> {
  // ユーザーディレクトリを取得
  let userDirPath: string
  try {
    userDirPath = storageService.getUserDirPath(user)
  } catch (err) {
    console.warn(`Failed to get user directory path: ${user.uid}`)
    return
  }

  // ユーザーディレクトリが削除されるまで待機
  // ユーザーディレクトリが存在しないことを確認できたら終了
  for (let i = 1; i <= 5; i++) {
    const userDirNode = await storageService.getDirNode(userDirPath)
    if (!userDirNode.exists) {
      console.log(`Removed user's directory: ${user.uid}, ${userDirNode.path}`)
      return
    }

    await sleep(1000)
  }

  console.warn(`Deletion of the user's user directory could not be confirmed: ${user.uid}, ${userDirPath}`)
}

/**
 * ユーザー追加によるCloud Functions実行で作成されたユーザーディレクトリを削除します。
 *
 * 削除する理由として、Cloud Functions実行で割り当てられたユーザーディレクトリの名前は
 * 乱数であり、開発時には使用しづらいためです。
 * @param uid
 */
async function removeUserStorageDir(uid: string): Promise<void> {
  for (let i = 1; i <= 5; i++) {
    const user = await admin.auth().getUser(uid)

    // ユーザーディレクトリを取得
    // ユーザーディレクトリが割り当てられていない状態でgetUserDirPath()すると
    // エラーが発生するのでtry-catchし、一定時間待機して再度チャレンジする
    let userDirPath: string
    try {
      userDirPath = storageService.getUserDirPath(user)
    } catch (err) {
      await sleep(1000)
      continue
    }

    // 取得したユーザーディレクトリを削除して終了
    const removeNodes = await storageService.removeDirs([userDirPath])
    if (removeNodes.length === 0) {
      await sleep(1000)
      continue
    }

    console.log(`Removed user's directory: ${uid}, ${removeNodes[0].path}`)
    return
  }

  console.warn(`The user's user directory could not be deleted: ${uid}`)
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}
