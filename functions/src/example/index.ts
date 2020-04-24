import 'reflect-metadata'
import * as express from 'express'
import * as functions from 'firebase-functions'
import { createNestHTTPApplication, initApp, isDevelopment } from './base'
import { config } from '../config'
import { forEach } from 'lodash'

initApp()

//========================================================================
//
//  HTTP Functions
//
//========================================================================

const prodHTTPFunctionDict = {
  foundationService: './gql/foundation',
  storageService: './gql/storage',
  productService: './gql/product',
  cartService: './gql/cart',
  storage: './rest/storage',
  productRESTService: './rest/product',
  cartRESTService: './rest/cart',
}

const devHTTPFunctionDict = {
  devService: './gql/dev',
}

const serverFunctionDict = isDevelopment() ? { ...prodHTTPFunctionDict, ...devHTTPFunctionDict } : { ...prodHTTPFunctionDict }

export function registryHTTPFunctions(functionMap: { [functionName: string]: string }): void {
  forEach(functionMap, (path, functionName) => {
    if (!process.env.FUNCTION_TARGET || process.env.FUNCTION_TARGET === functionName) {
      const server = express()
      createNestHTTPApplication(require(path).default, server)
      module.exports[functionName] = functions.region(config.functions.region).https.onRequest(server)
    }
  })
}
registryHTTPFunctions(serverFunctionDict)

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
