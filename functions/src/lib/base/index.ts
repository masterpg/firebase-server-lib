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

export { initFirebaseApp, initLib }
export * from './firestore'
export * from './gql'
export * from './validator'
