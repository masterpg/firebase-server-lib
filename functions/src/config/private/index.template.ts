//--------------------------------------------------
//  ベース設定
//--------------------------------------------------

const base = {
  firebase: {
    // FirebaseのAPIキーを設定
    // 1. 対象プロジェクトのFirebaseコンソールを開く。
    // 2. 左メニューから「プロジェクトの概要」の横にある「歯車アイコン」を選択。
    // 3. 「プロジェクト」領域内にある「ウェブ API キー」をの値を取得。
    // 4. コピーした値をここに設定。
    apiKey: 'AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsT',
  },
  functions: {
    // Cloud Functionsをデプロイするリージョンを設定
    region: 'asia-northeast1',
    // 例: https://asia-northeast1-my-example-app-1234.cloudfunctions.net
    baseURL: 'https://[リージョン]-[プロジェクトID].cloudfunctions.net',
  },
  storage: {
    // 例: gs://my-example-app-1234.appspot.com/
    bucket: 'gs://[プロジェクトID].appspot.com/',
  },
  cors: {
    // APIアクセスを許可するオリジンを設定
    whitelist: [],
  },
  elastic: {
    cloud: {
      // Elastic Cloud のエンドポイントをコピーして貼り付け
      id: 'my-example-app:Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1Ll2Mm3Nn4Oo5Pp6Qq7Rr8Ss9Tt0Uu1Vv2Ww3Xx4Yy5Zz6Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1Ll2Mm3N==',
    },
    auth: {
      // ｢ユーザー/パスワード｣でログインする場合の設定項目
      username: 'elastic',
      password: 'AaBbCcDdEeFfGgHhIiJjKkLl',

      // ｢API Key｣でログインする場合の設定項目
      // ※API Keyの作成について: https://qiita.com/tak7iji/items/8e696fcb7a0d71f6d0f0
      apiKey: 'Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1Ll2Mm3Nn4Oo5Pp6Qq7Rr8Ss9T==',
    },
  },
}

//--------------------------------------------------
//  本番設定
//--------------------------------------------------

export const prod = {
  ...base,
  cors: {
    whitelist: ['https://my-example-app-1234.web.app', 'https://my-example-app-1234.firebaseapp.com'],
  },
}

//--------------------------------------------------
//  開発設定
//--------------------------------------------------

export const dev = {
  ...base,
  cors: {
    whitelist: ['http://localhost', 'http://localhost:5010', 'http://localhost:5030', 'chrome-extension://aejoelaoggembcahagimdiliamlcdmfm'],
  },
}

//--------------------------------------------------
//  テスト設定
//--------------------------------------------------

export const test = {
  ...base,
  storage: {
    bucket: 'gs://staging.my-example-app-1234.appspot.com/',
  },
  cors: {
    whitelist: ['http://localhost'],
  },
}
