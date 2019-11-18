#!/bin/sh -e

firebase functions:config:set \
  app.credential="./dist/example/serviceAccountKey.json" \
  functions.region="asia-northeast1" \
  storage.bucket="gs://vue-base-project-7295.appspot.com/" \
  cors.whitelist="http://localhost"

firebase functions:config:get > ./.runtimeconfig.json
