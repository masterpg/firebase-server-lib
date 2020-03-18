import 'reflect-metadata'
import * as express from 'express'
import * as functions from 'firebase-functions'
import { AppModule } from './app.module'
import { Express } from 'express'
import { ExpressAdapter } from '@nestjs/platform-express'
import { HandlersServiceDI } from './services'
import { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { config } from '../config'
import { initApp } from './initializer'

initApp()

const server = express()
let app: INestApplication

const createNestServer = async (expressInstance: Express) => {
  const httpAdapter = new ExpressAdapter(expressInstance)
  app = await NestFactory.create(AppModule, httpAdapter, {
    logger: ['error', 'warn'],
  })
  return app.init()
}

createNestServer(server)
  // .then(v => console.log('Nest Ready'))
  .catch(err => console.error('Nest broken', err))

export const api = functions.region(config.functions.region).https.onRequest(server)

export const onCreateUser = functions.auth.user().onCreate(async (user, context) => {
  const handlers = app.get(HandlersServiceDI.symbol) as HandlersServiceDI.type
  await handlers.onCreateUser(user, context)
})

export const onDeleteUser = functions.auth.user().onDelete(async (user, context) => {
  const handlers = app.get(HandlersServiceDI.symbol) as HandlersServiceDI.type
  await handlers.onDeleteUser(user, context)
})
