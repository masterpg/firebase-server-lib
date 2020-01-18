#!/bin/sh -e

firebase functions:config:set \
  functions.region="asia-northeast1" \
  storage.bucket="gs://vue-base-project-7295.appspot.com/" \
  cors.whitelist="http://localhost" \
  cors.excludes="GET:^rest/site"

firebase functions:config:get > ./.runtimeconfig.json
