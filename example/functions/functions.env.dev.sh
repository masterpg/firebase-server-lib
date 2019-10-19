#!/bin/sh

firebase functions:config:set \
  app.credential="./lib/serviceAccountKey.json" \
  functions.region="asia-northeast1" \
  storage.bucket="gs://vue-base-project-7295.appspot.com/" \
  cors.whitelist="http://localhost, http://localhost:5000, http://localhost:5010, chrome-extension://aejoelaoggembcahagimdiliamlcdmfm"

firebase functions:config:get > ./.runtimeconfig.json
