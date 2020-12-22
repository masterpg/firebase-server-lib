import * as admin from 'firebase-admin'
import * as chalk from 'chalk'
import * as program from 'commander'
import { AppStorageServiceDI, AppStorageServiceModule, DevUtilsServiceDI, DevUtilsServiceModule } from '../src/app/services'
import axios, { AxiosRequestConfig } from 'axios'
import { createNestApplication, initFirebaseApp } from '../src/app/base'
import { Module } from '@nestjs/common'
import { config } from '../src/config'

//========================================================================
//
//  Interfaces
//
//========================================================================

const UID = 'keepalive'

//========================================================================
//
//  Implementation
//
//========================================================================

@Module({
  imports: [DevUtilsServiceModule, AppStorageServiceModule],
})
class KeepAliveToolModule {}

/**
 * キープアライブAPI用のIDトークンを取得します。
 */
async function getIdToken(): Promise<string> {
  const customToken = await admin.auth().createCustomToken(UID, {})
  let idToken = ''

  try {
    const response = await axios.request<{ idToken: string }>({
      url: `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${config.firebase.apiKey}`,
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        token: customToken,
        returnSecureToken: true,
      },
    })
    idToken = response.data.idToken
  } catch (err) {
    console.error(err)
  }

  return idToken
}

/**
 * `gql`のキープアライブAPIをリクエストします。
 * @param idToken
 */
async function keepAliveOfGQL(idToken?: string): Promise<void> {
  const reqConfig: AxiosRequestConfig = {
    baseURL: config.functions.baseURL,
    url: 'gql',
    method: 'post',
    data: {
      operationName: 'KeepAlive',
      query: 'query KeepAlive { keepAlive }',
    },
  }
  if (idToken) {
    reqConfig.headers = Object.assign(reqConfig.headers ?? {}, {
      Authorization: `Bearer ${idToken}`,
    })
  }

  try {
    const res = await axios.request(reqConfig)
    if (res.data.errors?.length) {
      console.error(`${chalk.red('GQL Error')}:`, res.data.errors[0].message, '\n')
    }
  } catch (err) {
    console.error(`${chalk.red('GQL Error')}:`, err.message, '\n')
  }
}

/**
 * `rest`のキープアライブAPIをリクエストします。
 * @param idToken
 */
async function keepAliveOfREST(idToken: string): Promise<void> {
  const reqConfig: AxiosRequestConfig = {
    baseURL: config.functions.baseURL,
    url: 'rest/keepalive',
    method: 'get',
  }
  if (idToken) {
    reqConfig.headers = Object.assign(reqConfig.headers ?? {}, {
      Authorization: `Bearer ${idToken}`,
    })
  }

  try {
    await axios.request(reqConfig)
  } catch (err) {
    if (err.response?.data) {
      console.error(`${chalk.red('REST Error')}:`, err.response.data, '\n')
    } else {
      console.error(`${chalk.red('REST Error')}:`, err.message, '\n')
    }
  }
}

/**
 * `storage`のキープアライブAPIをリクエストします。
 * @param idToken
 */
async function keepAliveOfStorage(idToken: string): Promise<void> {
  const reqConfig: AxiosRequestConfig = {
    baseURL: config.functions.baseURL,
    url: 'storage/keepalive',
    method: 'get',
  }
  if (idToken) {
    reqConfig.headers = Object.assign(reqConfig.headers ?? {}, {
      Authorization: `Bearer ${idToken}`,
    })
  }

  try {
    await axios.request(reqConfig)
  } catch (err) {
    if (err.response?.data) {
      console.error(`${chalk.red('Storage Error')}:`, err.response.data, '\n')
    } else {
      console.error(`${chalk.red('Storage Error')}:`, err.message, '\n')
    }
  }
}

/**
 * 全種別のキープアライブをリクエストします。
 */
async function keepAliveAll(): Promise<void> {
  const idToken = await getIdToken()

  const gqlRequests: Promise<void>[] = []
  const restRequests: Promise<void>[] = []
  const storageRequests: Promise<void>[] = []
  for (let i = 0; i < 5; i++) {
    gqlRequests.push(keepAliveOfGQL(idToken))
    restRequests.push(keepAliveOfREST(idToken))
    storageRequests.push(keepAliveOfStorage(idToken))
  }
  await Promise.all([...gqlRequests, ...restRequests, ...storageRequests])
}

//========================================================================
//
//  Commands
//
//========================================================================

program.action(async () => {
  initFirebaseApp()
  const nestApp = await createNestApplication(KeepAliveToolModule)
  const devUtilsService = nestApp.get(DevUtilsServiceDI.symbol) as DevUtilsServiceDI.type
  const storageService = nestApp.get(AppStorageServiceDI.symbol) as AppStorageServiceDI.type

  console.log() // 改行

  await keepAliveAll()
  return new Promise<void>(resolve => {
    setInterval(async () => {
      await keepAliveAll()
    }, 180000)
  })
})

program.parseAsync(process.argv)
