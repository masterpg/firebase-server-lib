import * as admin from 'firebase-admin'
import { config } from '../../config'

function initLib() {
  initFirebaseApp()
}

function initFirebaseApp() {
  admin.initializeApp({
    storageBucket: config.storage.bucket,
  })
}

export * from './firestore'
export * from './validator'
export { initFirebaseApp, initLib }
