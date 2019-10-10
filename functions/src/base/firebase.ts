import * as admin from 'firebase-admin'
import * as path from 'path'
import { config } from './config'

export function initFirebaseApp() {
  const serviceAccount = require(path.join(process.cwd(), 'lib/serviceAccountKey.json'))
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: config.storage.bucket,
  })
}
