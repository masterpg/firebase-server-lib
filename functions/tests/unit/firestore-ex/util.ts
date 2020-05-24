import * as admin from 'firebase-admin'
import * as crypto from 'crypto'
import { Firestore, FirestoreExOptions, TimestampEntity } from '../../../src/firestore-ex/types'
import { Dayjs } from 'dayjs'
import { initFirebaseApp } from '../../../src/lib/base'
import dayjs = require('dayjs')

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
  options: FirestoreExOptions

  static init(real: boolean) {
    if (real) {
      initFirebaseApp()
    } else {
      // Firestore still need to resolve firebase project name even using local emulator,
      // so set real firebase project id
      process.env.GCLOUD_PROJECT = 'vue-base-project-7295'
      process.env.FIRESTORE_EMULATOR_HOST = 'localhost:5020'
      admin.initializeApp({})
    }
    return admin.firestore()
  }

  constructor({ real }: { real?: boolean } = {}) {
    real = real || false
    // Use random collectionPath to separate each test namespace for concurrent testing
    this.collectionPath = crypto.randomBytes(10).toString('hex')
    this.db = AdminFirestoreTestUtil.init(real)
    this.options = {
      useTimestampInAll: true,
      timestampToDate: timestamp => dayjs(timestamp.toDate()),
    }
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

export interface TestTimestampEntity extends TimestampEntity<Dayjs> {}
