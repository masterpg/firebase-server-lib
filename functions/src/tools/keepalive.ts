import * as admin from 'firebase-admin'
import * as chalk from 'chalk'
import * as program from 'commander'
import axios, { AxiosRequestConfig } from 'axios'
import { initFirebaseApp } from '../lib/base'

const API_KEY = 'AIzaSyDspqN5hys8WldYolk_wBeTLNpxaJT9mCk'
const API_BASE_URL = 'https://asia-northeast1-lived-web-app-b9f08.cloudfunctions.net'
// const API_BASE_URL = 'http://localhost:5010/lived-web-app-b9f08/asia-northeast1'
const UID = 'app.admin'

async function getIdToken(): Promise<string> {
  const customToken = await admin.auth().createCustomToken(UID, {})
  let idToken = ''

  try {
    const response = await axios.request<{ idToken: string }>({
      url: `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
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

async function keepAliveOfGQL(idToken?: string): Promise<void> {
  const config: AxiosRequestConfig = {
    baseURL: API_BASE_URL,
    url: 'gql',
    method: 'post',
    data: {
      operationName: 'KeepAlive',
      query: 'query KeepAlive { keepAlive }',
    },
  }
  if (idToken) {
    config.headers = Object.assign(config.headers ?? {}, {
      Authorization: `Bearer ${idToken}`,
    })
  }

  try {
    const res = await axios.request(config)
    if (res.data.errors?.length) {
      console.error(`${chalk.red('GQL Error')}:`, res.data.errors[0].message, '\n')
    }
  } catch (err) {
    console.error(`${chalk.red('GQL Error')}:`, err.message, '\n')
  }
}

async function keepAliveOfREST(idToken: string): Promise<void> {
  const config: AxiosRequestConfig = {
    baseURL: API_BASE_URL,
    url: 'rest/keepalive',
    method: 'get',
  }
  if (idToken) {
    config.headers = Object.assign(config.headers ?? {}, {
      Authorization: `Bearer ${idToken}`,
    })
  }

  try {
    await axios.request(config)
  } catch (err) {
    if (err.response?.data) {
      console.error(`${chalk.red('REST Error')}:`, err.response.data, '\n')
    } else {
      console.error(`${chalk.red('REST Error')}:`, err.message, '\n')
    }
  }
}

async function keepAliveOfStorage(idToken: string): Promise<void> {
  const config: AxiosRequestConfig = {
    baseURL: API_BASE_URL,
    url: 'storage/keepalive',
    method: 'get',
  }
  if (idToken) {
    config.headers = Object.assign(config.headers ?? {}, {
      Authorization: `Bearer ${idToken}`,
    })
  }

  try {
    await axios.request(config)
  } catch (err) {
    if (err.response?.data) {
      console.error(`${chalk.red('Storage Error')}:`, err.response.data, '\n')
    } else {
      console.error(`${chalk.red('Storage Error')}:`, err.message, '\n')
    }
  }
}

program.action(async () => {
  initFirebaseApp()
  const idToken = await getIdToken()

  console.log() // 改行

  return new Promise<void>(resolve => {
    setInterval(async () => {
      await Promise.all([keepAliveOfGQL(idToken), keepAliveOfREST(idToken), keepAliveOfStorage(idToken)])
    }, 300000)
  })
})

program.parseAsync(process.argv)
