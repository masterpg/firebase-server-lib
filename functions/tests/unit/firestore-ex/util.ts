import * as admin from 'firebase-admin'
import * as crypto from 'crypto'
import { Firestore, FirestoreExOptions } from '../../../src/firestore-ex/types'
import { initFirebaseApp } from '../../../src/lib'

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

  static init(real: boolean) {
    if (real) {
      initFirebaseApp()
    } else {
      // Firestore still need to resolve firebase project name even using local emulator,
      // so set real firebase project id. This project uses package.json for this configuration.
      // + process.env.GCLOUD_PROJECT = 'lived-web-app-b9f08'
      // + process.env.FIRESTORE_EMULATOR_HOST = 'localhost:5020'
      admin.initializeApp({})
    }
    return admin.firestore()
  }

  constructor({ real }: { real?: boolean } = {}) {
    real = real || false
    // Use random collectionPath to separate each test namespace for concurrent testing
    this.collectionPath = crypto.randomBytes(10).toString('hex')
    this.db = AdminFirestoreTestUtil.init(real)
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
