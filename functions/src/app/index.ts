import 'reflect-metadata'
import * as express from 'express'
import * as functions from 'firebase-functions'
import { createNestHTTPApplication, initApp } from './base'
import { RuntimeOptions } from 'firebase-functions'
import { config } from '../config'
import { forEach } from 'lodash'

initApp()

//========================================================================
//
//  Helper methods
//
//========================================================================

/**
 * 現在の環境が開発環境か否かを取得します。
 * 本アプリケーションでは環境が本番、開発かによって使用可能なモジュールを切り分けます。
 * ローカル環境では`process.env.NODE_ENV`には値が設定されないため、
 * この関数では`process.env.NODE_ENV`を使用せずに開発環境か否かを判定しています。
 * ※本番環境では`process.env.NODE_ENV`に'production'が設定されます。
 */
const isDevelopment = () => (process.env.node || '').includes('nodenv')

//========================================================================
//
//  HTTP Functions
//
//========================================================================

export function registryHTTPFunctions(functionMap: { [functionName: string]: string }, runtimeOptions: RuntimeOptions = {}): void {
  forEach(functionMap, (path, functionName) => {
    if (!process.env.FUNCTION_TARGET || process.env.FUNCTION_TARGET === functionName) {
      const server = express()
      createNestHTTPApplication(require(path).default, server)
      module.exports[functionName] = functions.region(config.functions.region).runWith(runtimeOptions).https.onRequest(server)
    }
  })
}

registryHTTPFunctions({ gql_lv1: './gql/main/lv1' })
registryHTTPFunctions({ gql_lv3: './gql/main/lv3' }, { timeoutSeconds: 360, memory: '1GB' })
registryHTTPFunctions({ gql_example: './gql/example' })
registryHTTPFunctions({ rest_example: './rest/example' })
registryHTTPFunctions({ storage: './rest/storage' })
if (isDevelopment()) {
  registryHTTPFunctions({ gql_dev: './gql/dev' })
}

//========================================================================
//
//  Event Functions
//
//========================================================================

const prodEventFunctionDict = {
  authOnCreateUser: './functions-event/auth-on-create-user',
  authOnDeleteUser: './functions-event/auth-on-delete-user',
}

export function registryEventFunctions(functionMap: { [functionName: string]: string }): void {
  forEach(functionMap, (path, functionName) => {
    if (!process.env.FUNCTION_TARGET || process.env.FUNCTION_TARGET === functionName) {
      module.exports[functionName] = require(path).default
    }
  })
}
registryEventFunctions(prodEventFunctionDict)
