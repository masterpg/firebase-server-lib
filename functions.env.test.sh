#!/bin/sh -e

PROJECT="vue-base-project-7295"

firebase --project $PROJECT functions:config:set \
  app.credential="./serviceAccountKey.json" \
  functions.region="asia-northeast1" \
  storage.bucket="gs://vue-base-project-7295.appspot.com/" \
  cors.whitelist="http://localhost"

firebase --project $PROJECT functions:config:get > ./.runtimeconfig.json
