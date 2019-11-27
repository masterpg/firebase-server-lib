import * as admin from 'firebase-admin'
import * as path from 'path'
import { config } from './config'

export function initFirebaseApp() {
  const credentialFilePath = config.functions.credential
  const serviceAccount = require(path.resolve(process.cwd(), credentialFilePath))
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: config.storage.bucket,
  })
}
