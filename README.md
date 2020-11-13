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

#### Firebase プロジェクト名をソースコードに反映
ソースコードプロジェクト`firebase-server-lib`にある以下のファイルを開き、Firebase プロジェクト名の部分を作成したFirebase プロジェクト名に変更します。
* `firebase-server-lib/functions/src/config/dev-config.ts`
* `firebase-server-lib/functions/src/config/prod-config.ts`
* `firebase-server-lib/functions/src/config/test-config.ts`
* `firebase-server-lib/functions/rest-client.env.json`
* `firebase-server-lib/.firebaserc`

### 認証

#### 秘密鍵をプロジェクトに配置
1.  Firebase コンソールの左メニューから「プロジェクトの概要」の横にある「歯車アイコン」を選択し、「プロジェクトを設定」を選択。
2. 表示された画面上部にあるタブの「サービスアカウント」を選択。
3. 「Firebase Admin SDK」の画面が表示されるので、画面内にある「新しい秘密鍵を生成」ボタンをクリック。
4. 秘密鍵ファイルを`serviceAccountKey.json`というファイル名でダウンロードし、`vue-front-lib`のプロジェクトルートに配置する。

#### サインインプロバイダを有効にする
1. Firebase コンソールの左メニューから「Authentication」を選択。
2. 表示された画面上部にある「Sign-in method」タブを選択。
3. プロバイダ一覧が表示されるので、必要なプロバイダを有効にする。

#### IAM の設定
> 参考: [カスタム トークンを作成する - トラブルシューティング](https://firebase.google.com/docs/auth/admin/create-custom-tokens#troubleshooting)

##### IAM を有効にする
アプリケーションをデプロイし、初回サインインするとブラウザのデバッグコンソールに次のようなエラーが表示されます。

```
Identity and Access Management (IAM) API has not been used in project
1234567890 before or it is disabled. Enable it by visiting
https://console.developers.google.com/apis/api/iam.googleapis.com/overview?project=1234567890
then retry. If you enabled this API recently, wait a few minutes for the action
to propagate to our systems and retry.
```

このメッセージの中にあるリンクを開き、「APIを有効にする」ボタンをクリックして IAM を有効にします。

##### サービスアカウントの権限設定
1. Google Cloud Platform Console で [IAM と管理](https://console.cloud.google.com/projectselector2/iam-admin) ページを開く。
2. 対象のプロジェクトを選択。
3. 左メニューにある「IAM」を選択。
4. 表示されているメンバーの中から`{project-name}@appspot.gserviceaccount.com`を見つけ、このメンバーの「編集アイコン（鉛筆アイコン）」をクリック。
5. 「別のロールを追加」ボタンを押下したら、検索フィルタに「サービス アカウント トークン作成者」と入力し、結果からそれを選択し、「保存」をクリック。

## 単体テスト

### FirestoreEx の単体テスト実行
1. ターミナルで`yarn firestore`を実行。
2. 上記とは別のターミナルを開き、`yarn test:firestore-ex`を実行。
