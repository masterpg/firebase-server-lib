import * as admin from 'firebase-admin'
import { config } from '../../config'

export function initFirebaseApp() {
  admin.initializeApp({
    storageBucket: config.storage.bucket,
  })
}
