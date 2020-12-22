# firebase-server-lib

## プロジェクトセットアップ

### Firebase プロジェクトの作成

#### Webアプリの追加
1.  Firebase コンソールの左メニューから「プロジェクトの概要」の横にある「歯車アイコン」を選択し、「プロジェクトを設定」を選択。
2. 「マイアプリ」にある「Webアイコン」をクリック。
3. 指示に従ってWebアプリを追加する。
4. 「マイアプリ」にWebアプリが追加されたら、そのWebアプリを選択。
5. 「Firebase SDK snippet」のラジオボタンで「構成」を選択。
6. `vue-front-lib/firebase.config.js`を開き、スニペットの内容を貼り付け。

### 認証

#### 秘密鍵をプロジェクトに配置
1.  Firebase コンソールの左メニューから「プロジェクトの概要」の横にある「歯車アイコン」を選択し、「プロジェクトを設定」を選択。
2. 表示された画面上部にあるタブの「サービスアカウント」を選択。
3. 「Firebase Admin SDK」の画面が表示されるので、画面内にある「新しい秘密鍵を生成」ボタンをクリック。
4. 秘密鍵ファイルを`serviceAccountKey.json`というファイル名でダウンロードし、`firebase-server-lib`のプロジェクトルートに配置する。

#### サインインプロバイダを有効にする
1. Firebase コンソールの左メニューから「Authentication」を選択。
2. 表示された画面上部にある「Sign-in method」タブを選択。
3. プロバイダ一覧が表示されるので、必要なプロバイダを有効にする。

#### カスタムトークン用の IAM 設定
本アプリケーションではカスタムトークンを使用しています。カスタムトークンを使用するには以下の設定を行う必要があります。

> 参考: [カスタム トークンを作成する ](https://firebase.google.com/docs/auth/admin/create-custom-tokens)

##### IAM API を有効にする
次のリンクの`[PROJECT_ID]`の部分を実際のプロジェクトIDに置き換えてリンク先を開きます。画面上部にある「APIを有効にする」ボタンをクリックして IAM を有効にしてください。  
※`[PROJECT_ID]`の例: `my-example-app-1234`

https://console.developers.google.com/apis/api/iam.googleapis.com/overview?project=[PROJECT_ID]


この設定を行わずにブラウザからWebアプリケーションにアクセスすると、次のようなエラーが発生することがあります。

```
Identity and Access Management (IAM) API has not been used in project
[PROJECT_ID] before or it is disabled. Enable it by visiting
https://console.developers.google.com/apis/api/iam.googleapis.com/overview?project=[PROJECT_ID]
then retry. If you enabled this API recently, wait a few minutes for the action
to propagate to our systems and retry.
```

> 参考: [カスタム トークンを作成する - トラブルシューティング](https://firebase.google.com/docs/auth/admin/create-custom-tokens#troubleshooting)

##### サービスアカウントの権限設定
1. Google Cloud Platform Console で [IAM と管理](https://console.cloud.google.com/projectselector2/iam-admin) ページを開く。
2. 対象のプロジェクトを選択。
3. 左メニューにある「IAM」を選択。
4. 表示されているメンバーの中から`{project-name}@appspot.gserviceaccount.com`を見つけ、このメンバーの「編集アイコン（鉛筆アイコン）」をクリック。
5. 「別のロールを追加」ボタンを押下したら、検索フィルタに「サービス アカウント トークン作成者」と入力し、結果からそれを選択し、「保存」をクリック。

### 設定ファイル

#### プライベート設定ファイル
`firebase-server-lib/functions/src/config/private/index.template.ts`をコピーし、同じ場所に`index.ts`という名前で配置します。このファイルに記述されているコメントを参考に値を設定してください。

#### .firebaserc
`firebase-server-lib/.firebaserc`に適切なプロジェクトIDを設定してください。

#### JetBrains エディタの HTTP クライアント設定
`firebase-server-lib/functions/http-client.env.template.json`をコピーし、同じ場所に`http-client.env.json`という名前で配置します。

* `apiHost`: APIのリクエスト先ホストを設定。
* `elasticHost`: Elasticsearch のリクエスト先ホストを設定。
* `elasticToken`: Elasticsearch へリクエストするためのベーシック認証トークン。`USERNAME:PASSWORD`を Base64 でエンコードし、トークンとして設定。※ [HTTP/REST clients and security](https://www.elastic.co/guide/en/elasticsearch/reference/current/http-clients.html#http-clients)

### Elasticsearch の環境構築

#### インデックスの初期化
本アプリケーションで必要な「インデックス」を作成します。まず Elasticsearch のツールを使用するためにビルドを行います。

```
$ yarn build
```

これで Elasticsearch のツールが使用可能になったので、次のコマンドでインデックスを作成します。

```
$ yarn elastic indices:init
```



## 単体テスト

### FirestoreEx の単体テスト実行
1. ターミナルで`yarn firestore`を実行。
2. 上記とは別のターミナルを開き、`yarn test:firestore-ex`を実行。
