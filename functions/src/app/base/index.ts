import * as admin from 'firebase-admin'
import { Express } from 'express'
import { ExpressAdapter } from '@nestjs/platform-express'
import { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { config } from '../../config'

//========================================================================
//
//  Implementation
//
//========================================================================

function initApp(): void {
  initFirebaseApp()
}

function initFirebaseApp(): void {
  admin.initializeApp({
    storageBucket: config.storage.bucket,
  })
}

/**
 * NestをHTTPアプリケーションとして作成します。
 * @param module
 * @param expressInstance
 */
async function createNestHTTPApplication(module: any, expressInstance: Express): Promise<INestApplication> {
  const httpAdapter = new ExpressAdapter(expressInstance)
  const nestApp = await NestFactory.create(module, httpAdapter, {
    logger: ['error', 'warn'],
  })
  return nestApp.init()
}

/**
 * Nestをプレーンなアプリケーションとして作成します。
 * @param module
 */
async function createNestApplication(module: any): Promise<INestApplication> {
  const nestApp = await NestFactory.create(module, {
    logger: ['error', 'warn'],
  })
  return nestApp.init()
}

/**
 * エンティティIDを生成します。
 * @param entityName エンティティ名を指定します。
 */
function generateEntityId(entityName: string): string {
  return admin.firestore().collection(entityName).doc().id
}

//========================================================================
//
//  Exports
//
//========================================================================

export { initApp, initFirebaseApp, createNestHTTPApplication, createNestApplication, generateEntityId }
export * from './firestore'
export * from './validator'
