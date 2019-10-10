import 'reflect-metadata'
import * as express from 'express'
import * as functions from 'firebase-functions'
import { AppModule } from './app.module'
import { ExpressAdapter } from '@nestjs/platform-express'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { config } from './base/config'
import { initFirebaseApp } from './base/firebase'

initFirebaseApp()

const server = express()

const createNestServer = async (expressInstance: express.Express) => {
  const httpAdapter = new ExpressAdapter(expressInstance)
  const app = await NestFactory.create(AppModule, httpAdapter, {
    logger: ['error', 'warn'],
  })
  // app.useGlobalPipes(new ValidationPipe())
  return app.init()
}

createNestServer(server)
  // .then(v => console.log('Nest Ready'))
  .catch(err => console.error('Nest broken', err))

export const api = functions.region(config.functions.region).https.onRequest(server)
