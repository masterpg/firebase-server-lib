export default {
  firebase: {
    apiKey: 'AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz',
    apiBaseURL: 'https://example.com',
  },

  elastic: {
    cloud: {
      // Elastic Cloud のエンドポイントをコピーして貼り付け
      id: 'my-index:Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1Ll2Mm3Nn4Oo5Pp6Qq7Rr8Ss9Tt0Uu1Vv2Ww3Xx4Yy5Zz6Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1Ll2Mm3N==',
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
