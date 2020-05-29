import * as admin from 'firebase-admin'
import * as path from 'path'
import { DocumentReference, Timestamp } from '@google-cloud/firestore'
import { FirestoreServiceDI, FirestoreServiceModule, UserClaims } from '../nest'
import { Inject, Module } from '@nestjs/common'
import { User, UserInfoInput, UserServiceDI, UserServiceModule } from './user'
import { removeBothEndsSlash, splitFilePath } from 'web-base-lib'
import { File } from '@google-cloud/storage'
import { JSONObject } from './base'
import dayjs = require('dayjs')
import { isISO8601 } from 'validator'
import { isNumber } from 'lodash'
import UserRecord = admin.auth.UserRecord
const firebaseTools = require('firebase-tools')

//========================================================================
//
//  Interfaces
//
//========================================================================

interface PutTestStoreDataInput {
  collectionName: string
  collectionRecords: JSONObject[]
}

interface TestSignedUploadUrlInput {
  filePath: string
  contentType?: string
}

interface TestFirebaseUserInput {
  uid: string
  email?: string
  emailVerified?: boolean
  password?: string
  displayName?: string
  disabled?: boolean
  photoURL?: string
  customClaims?: UserClaims
}

type TestUserInput = TestFirebaseUserInput & UserInfoInput

//========================================================================
//
//  Implementation
//
//========================================================================

class DevUtilsService {
  constructor(
    @Inject(FirestoreServiceDI.symbol) protected readonly firestoreService: FirestoreServiceDI.type,
    @Inject(UserServiceDI.symbol) protected readonly userService: UserServiceDI.type
  ) {}

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  async putTestStoreData(inputs: PutTestStoreDataInput[]): Promise<void> {
    {
      const processes: Promise<void>[] = []
      for (const item of inputs) {
        processes.push(this.m_deleteCollection(item.collectionName))
      }
      await Promise.all(processes)
    }

    {
      const processes: Promise<void>[] = []
      for (const item of inputs) {
        processes.push(this.m_buildCollection(item.collectionName, item.collectionRecords))
      }
      await Promise.all(processes)
    }
  }

  async getTestSignedUploadUrls(inputs: TestSignedUploadUrlInput[]): Promise<string[]> {
    const bucket = admin.storage().bucket()
    const urlDict: { [path: string]: string } = {}

    for (const input of inputs) {
      const { filePath, contentType } = input
      const { fileName, dirPath } = splitFilePath(filePath)
      const gcsFilePath = path.join(dirPath, fileName)
      const gcsFileNode = bucket.file(gcsFilePath)

      urlDict[filePath] = (
        await gcsFileNode.createResumableUpload({
          origin: '*',
          metadata: { contentType },
        })
      )[0]
    }

    return inputs.map(input => urlDict[input.filePath])
  }

  async removeTestStorageFiles(filePaths: string[]): Promise<void> {
    const bucket = admin.storage().bucket()

    const promises: Promise<void>[] = []
    for (const filePath of filePaths) {
      promises.push(
        (async () => {
          const gcsFilePath = removeBothEndsSlash(filePath)
          const gcsFileNode = bucket.file(gcsFilePath)
          const exists = (await gcsFileNode.exists())[0]
          if (exists) {
            await gcsFileNode.delete()
          }
        })()
      )
    }
    await Promise.all(promises)
  }

  async removeTestStorageDir(dirPath: string): Promise<void> {
    dirPath = path.join(removeBothEndsSlash(dirPath), '/')

    const bucket = admin.storage().bucket()
    const response = await bucket.getFiles({ directory: dirPath })
    const gcsNodes = response[0] as File[]

    const promises: Promise<void>[] = []
    for (const gcsNode of gcsNodes) {
      promises.push(gcsNode.delete().then())
    }
    await Promise.all(promises)
  }

  async setTestFirebaseUsers(...inputs: TestFirebaseUserInput[]): Promise<UserRecord[]> {
    return await Promise.all(inputs.map(input => this.m_setTestFirebaseUser(input)))
  }

  async deleteTestFirebaseUsers(...uids: string[]): Promise<void> {
    await Promise.all(
      uids.map(async uid => {
        try {
          await admin.auth().deleteUser(uid)
        } catch (err) {}
      })
    )
  }

  async setTestUsers(...inputs: TestUserInput[]): Promise<User[]> {
    const dict: { [uid: string]: User } = {}
    await Promise.all(
      inputs.map(async input => {
        await this.setTestFirebaseUsers(input)
        const user = await this.userService.setUserInfo(input.uid, input)
        dict[user.id] = user
      })
    )
    return inputs.reduce((result, input) => {
      result.push(dict[input.uid])
      return result
    }, [] as User[])
  }

  async deleteTestUsers(...uids: string[]): Promise<void> {
    await Promise.all(
      uids.map(async uid => {
        await this.userService.deleteUser(uid)
      })
    )
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  private async m_deleteCollection(collectionName: string): Promise<void> {
    await this.firestoreService.deepDeleteCollection(collectionName)
  }

  /**
   * @deprecated
   */
  private async m_deleteCollectionWithFirebaseTools(collectionName: string): Promise<void> {
    await firebaseTools.firestore.delete(collectionName, {
      project: process.env.GCLOUD_PROJECT,
      recursive: true,
      yes: true,
      // token: functions.config().fb.token,
    })
  }

  private async m_buildCollection(collectionName: string, collectionRows: any[]): Promise<void> {
    const docs = await this.m_createCollectionDocs(collectionName, collectionRows)
    const db = admin.firestore()
    await db.runTransaction(async transaction => {
      for (const doc of docs) {
        transaction.create(doc.ref, doc.data)
      }
    })
  }

  private async m_createCollectionDocs(
    collectionName: string,
    collectionRows: any[],
    parentDoc?: DocumentReference
  ): Promise<{ ref: DocumentReference; data: any }[]> {
    const db = admin.firestore()
    const result: { ref: DocumentReference; data: any }[] = []

    for (const collectionRow of collectionRows) {
      // ドキュメントリファレンスの作成
      let docRef: DocumentReference
      // 親ドキュメントがない場合
      if (!parentDoc) {
        docRef = db.collection(collectionName).doc(collectionRow.id)
      }
      // 親ドキュメントがある場合
      else {
        docRef = parentDoc.collection(collectionName).doc(collectionRow.id)
      }

      // ドキュメントデータの作成
      const docData: any = {}
      for (const memberKey of Object.keys(collectionRow)) {
        if (memberKey === 'id') continue
        const memberItem = collectionRow[memberKey]
        // メンバーアイテムがオブジェクト配列の場合、コレクションとみなす
        if (this.m_isArray(memberItem) && memberItem.length && this.m_isObject(memberItem[0])) {
          const docs = await this.m_createCollectionDocs(memberKey, memberItem, docRef)
          result.push(...docs)
        }
        // メンバーアイテムが数値だった場合
        else if (isNumber(memberItem)) {
          docData[memberKey] = memberItem
        }
        // メンバーアイテムが日付文字列だった場合
        else if (typeof memberItem === 'string' && isISO8601(memberItem)) {
          docData[memberKey] = Timestamp.fromDate(dayjs(memberItem).toDate())
        }
        // 上記以外の場合
        // ※数値、日付、以外のプリミティブ型の値とみなす
        else {
          docData[memberKey] = memberItem
        }
      }
      result.push({ ref: docRef, data: docData })
    }

    return result
  }

  private async m_setTestFirebaseUser(input: TestFirebaseUserInput): Promise<UserRecord> {
    let userRecord: UserRecord | undefined = undefined
    try {
      userRecord = await admin.auth().getUser(input.uid)
    } catch (e) {
      // 存在しないuidでgetUser()するとエラーが発生するのでtry-catchしている
    }

    if (!userRecord) {
      userRecord = await admin.auth().createUser(input)
    } else {
      userRecord = await admin.auth().updateUser(input.uid, input)
    }

    // カスタムクレームの設定
    if (input.customClaims) {
      const customClaims = { ...userRecord.customClaims, ...input.customClaims }
      await admin.auth().setCustomUserClaims(input.uid, customClaims)
    }

    return await admin.auth().getUser(input.uid)
  }

  private m_isArray(value: any) {
    return Array.isArray(value)
  }

  private m_isObject(value: any): boolean {
    return value instanceof Object && !(value instanceof Array)
  }
}

namespace DevUtilsServiceDI {
  export const symbol = Symbol(DevUtilsService.name)
  export const provider = {
    provide: symbol,
    useClass: DevUtilsService,
  }
  export type type = DevUtilsService
}

@Module({
  providers: [DevUtilsServiceDI.provider],
  exports: [DevUtilsServiceDI.provider],
  imports: [FirestoreServiceModule, UserServiceModule],
})
class DevUtilsServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export {
  DevUtilsService,
  DevUtilsServiceDI,
  DevUtilsServiceModule,
  PutTestStoreDataInput,
  TestFirebaseUserInput,
  TestSignedUploadUrlInput,
  TestUserInput,
}
