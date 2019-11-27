#!/bin/sh -e

firebase functions:config:set \
  functions.credential="./dist/example/serviceAccountKey.json" \
  functions.region="asia-northeast1" \
  storage.bucket="gs://vue-base-project-7295.appspot.com/" \
  cors.whitelist="https://vue-base-project-7295.web.app, https://vue-base-project-7295.firebaseapp.com"
