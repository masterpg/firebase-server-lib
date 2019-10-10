import URI from 'urijs'

export interface Config {
  api: {
    protocol: string
    host: string
    port: number
    basePath: string
    baseURL: string
  }

  firebase: {
    apiKey: string
    authDomain: string
    databaseURL?: string
    projectId?: string
    storageBucket?: string
    messagingSenderId?: string
  }
}

class ConfigImpl implements Config {
  constructor() {
    firebase.initializeApp(this.firebase)
  }

  get api() {
    const apiEnv = {
      protocol: String(process.env.VUE_APP_API_PROTOCOL),
      host: String(process.env.VUE_APP_API_HOST),
      port: Number(process.env.VUE_APP_API_PORT),
      basePath: String(process.env.VUE_APP_API_BASE_PATH),
    }

    const baseURL = new URI()
    if (apiEnv.protocol) baseURL.protocol(apiEnv.protocol)
    if (apiEnv.host) baseURL.hostname(apiEnv.host)
    if (apiEnv.port) baseURL.port(apiEnv.port.toString(10))
    if (apiEnv.basePath) baseURL.path(apiEnv.basePath)
    baseURL.query('')

    return {
      ...apiEnv,
      baseURL: baseURL.toString().replace(/\/$/, ''),
    }
  }

  readonly firebase = {
    apiKey: '<API_KEY>',
    authDomain: '<PROJECT_ID>.firebaseapp.com',
    databaseURL: 'https://<DATABASE_NAME>.firebaseio.com',
    projectId: '<PROJECT_ID>',
    storageBucket: '<BUCKET>.appspot.com',
    messagingSenderId: '<SENDER_ID>',
  }
}

export let config: Config

export function initConfig(): void {
  config = new ConfigImpl()
}
