#!/bin/sh -e

SERVICE_ACCOUNT_FILE="./example/functions/serviceAccountKey.json"
PROJECT="vue-base-project-7295"

if [ ! -e $SERVICE_ACCOUNT_FILE ]; then
  echo "\"$SERVICE_ACCOUNT_FILE\" not found." 1>&2
  exit 1
fi

cp $SERVICE_ACCOUNT_FILE ./lib

firebase --project $PROJECT functions:config:set \
  functions.region="asia-northeast1" \
  storage.bucket="gs://vue-base-project-7295.appspot.com/" \
  cors.whitelist="http://localhost" \
  role.app.admins="taro@example.com"

firebase --project $PROJECT functions:config:get > ./.runtimeconfig.json
