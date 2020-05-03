import * as admin from 'firebase-admin'
import * as path from 'path'
import { FirestoreServiceDI, FirestoreServiceModule } from '../nest'
import { Inject, Module } from '@nestjs/common'
import { removeBothEndsSlash, splitFilePath } from 'web-base-lib'
import { DocumentReference } from '@google-cloud/firestore'
import { File } from '@google-cloud/storage'
import { JSONObject } from './base'
const firebaseTools = require('firebase-tools')

//========================================================================
//
//  Interfaces
//
//========================================================================

interface PutTestDataInput {
  collectionName: string
  collectionRecords: JSONObject[]
}

interface TestSignedUploadUrlInput {
  filePath: string
  contentType?: string
}

//========================================================================
//
//  Implementation
//
//========================================================================

class LibDevUtilsService {
  constructor(@Inject(FirestoreServiceDI.symbol) protected readonly firestoreService: FirestoreServiceDI.type) {}

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  async putTestData(inputs: PutTestDataInput[]): Promise<void> {
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
        // 上記以外はメンバーアイテムをプリミティブな型とみなす
        else {
          docData[memberKey] = memberItem
        }
      }
      result.push({ ref: docRef, data: docData })
    }

    return result
  }

  private m_isArray(value: any) {
    return Array.isArray(value)
  }

  private m_isObject(value: any): boolean {
    return value instanceof Object && !(value instanceof Array)
  }
}

namespace LibDevUtilsServiceDI {
  export const symbol = Symbol(LibDevUtilsService.name)
  export const provider = {
    provide: symbol,
    useClass: LibDevUtilsService,
  }
  export type type = LibDevUtilsService
}

@Module({
  providers: [LibDevUtilsServiceDI.provider],
  exports: [LibDevUtilsServiceDI.provider],
  imports: [FirestoreServiceModule],
})
class LibDevUtilsServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { PutTestDataInput, TestSignedUploadUrlInput, LibDevUtilsService, LibDevUtilsServiceDI, LibDevUtilsServiceModule }
