import * as admin from 'firebase-admin'
import * as crypto from 'crypto'
import { Firestore } from '../../../src/firestore-ex/types'
import { initFirebaseApp } from '../../../src/app/base'

export const deleteCollection = async (db: Firestore, collectionPath: string) => {
  const batch = db.batch()
  const snap = await db.collection(collectionPath).get()
  snap.forEach(doc => {
    batch.delete(doc.ref)
  })
  await batch.commit()
}

export const createRandomCollectionName = (prefix = 'firebase_simple_') => {
  const str = crypto.randomBytes(10).toString('hex')
  return prefix + str
}

export class AdminFirestoreTestUtil {
  db: Firestore
  collectionPath: string

  static init() {
    initFirebaseApp()
    return admin.firestore()
  }

  constructor() {
    // Use random collectionPath to separate each test namespace for concurrent testing
    this.collectionPath = crypto.randomBytes(10).toString('hex')
    this.db = AdminFirestoreTestUtil.init()
  }

  // Clear collection all documents.
  // Use in 'afterEach'
  async deleteCollection() {
    const batch = this.db.batch()
    const snap = await this.db.collection(this.collectionPath).get()
    snap.forEach(doc => {
      batch.delete(doc.ref)
    })
    await batch.commit()
  }

  // Delete firebase listener
  // Use in 'afterAll'
  async deleteApps() {
    await Promise.all(admin.apps.map(app => app?.delete()))
  }
}
