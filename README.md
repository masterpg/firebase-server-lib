# firebase-server-lib

## 開発環境の設定

### Firebase

#### 環境変数を設定する

開発環境から Firebase へ接続するには、認証情報が含まれるファイルへのパスを環境変数に設定する必要があります（[認証の開始 - 認証を確認する](https://cloud.google.com/docs/authentication/getting-started#setting_the_environment_variable)）。

```bash
export GOOGLE_APPLICATION_CREDENTIALS="[PATH]/serviceAccountKey.json"
```

> **_NOTE_**: ファイル名はできるだけ`serviceAccountKey.json`にしてください。このファイル名はプロジェクトの`.gitignore`で指定されています。認証情報を含んだファイルを git にプッシュさせないためです。

## 依存ライブラリ

#### 共通で必要なライブラリ

- dependencies
  - @nestjs/common
  - @nestjs/core
  - @nestjs/graphql
  - @nestjs/platform-express
  - apollo-server-express
  - dayjs
  - firebase-admin
  - firebase-functions
  - graphql
  - graphql-subscriptions
  - lodash
  - reflect-metadata
  - web-base-lib
- devDependencies

  - @types/graphql-type-json
  - @types/jest
  - @types/supertest
  - jest
  - supertest
  - ts-jest
  - typescript

#### `functions/src/lib`に必要なライブラリ

- dependencies
  - @google-cloud/logging
  - async-exit-hook
  - chokidar
  - class-transformer
  - convert-hrtime
  - firebase-tools
  - glob
  - graphql-toolkit
  - graphql-type-json
  - vary
  - yargs
- devDependencies
  - @nestjs/testing
  - @types/vary
  - @types/yargs
  - @typescript-eslint/eslint-plugin
  - @typescript-eslint/parser
  - eslint
  - eslint-config-prettier
  - eslint-plugin-prettier
  - prettier
  - supertest

#### `functions/src/example`に必要なライブラリ

- dependencies
- devDependencies
