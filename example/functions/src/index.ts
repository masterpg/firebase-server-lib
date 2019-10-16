import 'reflect-metadata'
import * as express from 'express'
import * as functions from 'firebase-functions'
import { config, initFirebaseApp } from 'web-server-lib'
import { AppModule } from './app.module'
import { Express } from 'express'
import { ExpressAdapter } from '@nestjs/platform-express'
import { NestFactory } from '@nestjs/core'

initFirebaseApp()

const server = express()

const createNestServer = async (expressInstance: Express) => {
  const httpAdapter = new ExpressAdapter(expressInstance)
  const app = await NestFactory.create(AppModule, httpAdapter, {
    logger: ['error', 'warn'],
  })
  return app.init()
}

createNestServer(server)
  // .then(v => console.log('Nest Ready'))
  .catch(err => console.error('Nest broken', err))

export const api = functions.region(config.functions.region).https.onRequest(server)
