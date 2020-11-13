import 'reflect-metadata'
import * as express from 'express'
import * as functions from 'firebase-functions'
import { createNestHTTPApplication, initApp } from './base'
import { config } from '../config'
import { forEach } from 'lodash'

initApp()

//========================================================================
//
//  HTTP Functions
//
//========================================================================

export function registryHTTPFunctions(functionMap: { [functionName: string]: string }): void {
  forEach(functionMap, (path, functionName) => {
    if (!process.env.FUNCTION_TARGET || process.env.FUNCTION_TARGET === functionName) {
      const server = express()
      createNestHTTPApplication(require(path).default, server)
      module.exports[functionName] = functions.region(config.functions.region).https.onRequest(server)
    }
  })
}

registryHTTPFunctions({ gql: './gql/gql.module' })
registryHTTPFunctions({ rest: './rest/rest.module' })
registryHTTPFunctions({ storage: './rest/storage.module' })

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
