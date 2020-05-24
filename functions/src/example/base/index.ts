import { Express } from 'express'
import { ExpressAdapter } from '@nestjs/platform-express'
import { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { initLib } from '../../lib/base'

//========================================================================
//
//  Implementation
//
//========================================================================

function initApp() {
  initLib()
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
 * 現在の環境が開発環境か否かを取得します。
 * 本アプリケーションでは環境が本番、開発かによって使用可能なモジュールを切り分けます。
 * ローカル環境では`process.env.NODE_ENV`には値が設定されないため(本番環境では'production'が設定される)、
 * この関数では`process.env.NODE_ENV`を使用せずに開発環境か否かを判定しています。
 */
const isDevelopment = () => (process.env.node || '').includes('nodenv')

//========================================================================
//
//  Exports
//
//========================================================================

export { initApp, createNestHTTPApplication, createNestApplication, isDevelopment }
