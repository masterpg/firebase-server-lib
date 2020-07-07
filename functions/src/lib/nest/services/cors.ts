import * as vary from 'vary'
import { HTTPLoggingData, HTTPLoggingServiceDI, HTTPLoggingServiceModule, LoggingLatencyTimer } from './logging'
import { Inject, Module } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'
import { GraphQLResolveInfo } from 'graphql'
import { config } from '../../../config'
import { removeStartSlash } from 'web-base-lib'
import onFinished = require('on-finished')
import dayjs = require('dayjs')

//========================================================================
//
//  Interfaces
//
//========================================================================

interface CORSOptions {
  whitelist?: string[]
  methods?: string[]
  allowedHeaders?: string[]
  exposedHeaders?: string[]
  credentials?: boolean
  maxAge?: number
  optionsSuccessStatus?: number
  allowedBlankOrigin?: boolean
  isLogging?: boolean
}

//========================================================================
//
//  Implementation
//
//========================================================================

abstract class CORSService {
  //----------------------------------------------------------------------
  //
  //  Constructor
  //
  //----------------------------------------------------------------------

  constructor(@Inject(HTTPLoggingServiceDI.symbol) protected readonly loggingService: HTTPLoggingServiceDI.type) {}

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  protected get defaultOptions(): CORSOptions {
    return {
      whitelist: config.cors.whitelist,
      methods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
      credentials: false,
      optionsSuccessStatus: 204,
      allowedBlankOrigin: true,
      isLogging: false,
    }
  }

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  validate(context: { req: Request; res: Response; info?: GraphQLResolveInfo }, next?: NextFunction, options?: CORSOptions): boolean {
    const { req, res } = context
    options = {
      ...this.defaultOptions,
      ...(options || {}),
    }

    const isAllowed = this.isAllowed(options, req)
    if (!isAllowed && options.isLogging) {
      this.logNotAllowed(context, options)
    }

    const headers = []
    const method = req.method && req.method.toUpperCase && req.method.toUpperCase()

    headers.push(this.configureOrigin(options, req))
    headers.push(this.configureCredentials(options))
    headers.push(this.configureExposedHeaders(options))

    // プリフライトリクエスト
    if (method === 'OPTIONS') {
      headers.push(this.configureMethods(options))
      headers.push(this.configureAllowedHeaders(options, req))
      headers.push(this.configureMaxAge(options))
      this.applyHeaders(headers, res)
      // Safari (and potentially other browsers) need content-length 0,
      //   for 204 or they just hang waiting for a body
      res.statusCode = options.optionsSuccessStatus!
      res.setHeader('Content-Length', '0')
      res.end()
    }
    // 通常リクエスト
    else {
      this.applyHeaders(headers, res)
      next && next()
    }

    return isAllowed
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  protected isAllowed(options: CORSOptions, req: Request): boolean {
    // リクエストがCORS除外リストと一致する場合、リクエストを許可
    if (this.isExcluded(req)) {
      return true
    }

    const requestOrigin = (req.headers.origin as string) || ''
    const whitelist = options.whitelist || []

    // リクエストオリジンの空を許容していて、かつリクエストオリジンが空の場合、リクエストを許可
    if (options.allowedBlankOrigin && !requestOrigin) {
      return true
    }

    // ホワイトリストが指定されている場合
    if (whitelist.length > 0) {
      // リクエストオリジンがホワイトリストに含まれている場合、リクエストを許可
      const isWhiteOrigin = whitelist.indexOf(requestOrigin) >= 0
      if (isWhiteOrigin) {
        return true
      }
    }

    return false
  }

  /**
   * リクエストがCORS除外リストと一致するかを取得します。
   * @param req
   */
  protected isExcluded(req: Request): boolean {
    for (const exclude of config.cors.excludes) {
      if (exclude.method && exclude.method !== req.method) continue

      const apiPath = removeStartSlash(req.originalUrl)
      const reg = new RegExp(exclude.pattern)
      const tested = reg.test(apiPath)
      if (tested) return true
    }

    return false
  }

  protected configureOrigin(options: CORSOptions, req: Request) {
    const headers: any = []
    const whitelist = options.whitelist || []
    const requestOrigin = (req.headers.origin as string) || ''

    // リクエストがCORS除外リストと一致する場合、リクエストを許可
    if (this.isExcluded(req)) {
      headers.push({ key: 'Access-Control-Allow-Origin', value: '*' })
      return headers
    }

    // リクエストオリジンの空を許容していて、かつリクエストオリジンが空の場合、リクエストを許可
    if (options.allowedBlankOrigin && !requestOrigin) {
      headers.push({ key: 'Access-Control-Allow-Origin', value: '*' })
      return headers
    }

    // リクエストオリジンがホワイトリストに含まれている場合、リクエストを許可
    if (whitelist.length > 0 && whitelist.indexOf(requestOrigin) >= 0) {
      headers.push({ key: 'Access-Control-Allow-Origin', value: requestOrigin })
      headers.push({ key: 'Vary', value: 'Origin' })
    }
    // リクエストオリジンがホワイトリストに含まれていない場合、リクエストを拒否
    else {
      headers.push({ key: 'Access-Control-Allow-Origin', value: '' })
    }
    return headers
  }

  protected configureCredentials(options: CORSOptions) {
    if (options.credentials === true) {
      return {
        key: 'Access-Control-Allow-Credentials',
        value: 'true',
      }
    }
    return null
  }

  protected configureMethods(options: CORSOptions) {
    let methods: string | undefined

    if (options.methods) {
      methods = options.methods.join(',')
    }

    if (methods) {
      return {
        key: 'Access-Control-Allow-Methods',
        value: methods,
      }
    }
    return null
  }

  protected configureAllowedHeaders(options: CORSOptions, req: Request) {
    const headers = []
    let allowedHeaders: string | undefined

    if (!options.allowedHeaders) {
      // リクエストヘッダーの'access-control-request-headers'に指定された値を
      // レスポンスの'Access-Control-Allow-Headers'に設定する
      allowedHeaders = req.headers['access-control-request-headers'] as string | undefined
      headers.push({
        key: 'Vary',
        value: 'Access-Control-Request-Headers',
      })
    } else {
      // オプションの'allowedHeaders'に指定された値を
      // レスポンスの'Access-Control-Allow-Headers'に設定する
      allowedHeaders = options.allowedHeaders.join(',')
    }

    if (allowedHeaders) {
      headers.push({
        key: 'Access-Control-Allow-Headers',
        value: allowedHeaders,
      })
    }

    return headers
  }

  protected configureMaxAge(options: CORSOptions) {
    const maxAge = (typeof options.maxAge === 'number' || options.maxAge) && options.maxAge.toString()
    if (maxAge && maxAge.length) {
      return {
        key: 'Access-Control-Max-Age',
        value: maxAge,
      }
    }
    return null
  }

  protected configureExposedHeaders(options: CORSOptions) {
    let exposedHeaders: string | undefined

    if (!options.exposedHeaders) {
      return null
    } else {
      exposedHeaders = options.exposedHeaders.join(',')
    }

    if (exposedHeaders) {
      return {
        key: 'Access-Control-Expose-Headers',
        value: exposedHeaders,
      }
    }
    return null
  }

  protected applyHeaders(headers: any, res: Response) {
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i]
      if (header) {
        if (Array.isArray(header)) {
          this.applyHeaders(header, res)
        } else if (header.key === 'Vary' && header.value) {
          vary(res, header.value)
        } else {
          res.setHeader(header.key, header.value)
        }
      }
    }
  }

  protected logNotAllowed(context: { req: Request; res: Response; info?: GraphQLResolveInfo }, options: CORSOptions) {
    const { req, res, info } = context
    const latencyTimer = new LoggingLatencyTimer().start()
    const timestamp = dayjs()
    onFinished(res, () => {
      this.loggingService.log({
        req,
        res,
        info,
        latencyTimer,
        data: this.getErrorData(req, options),
        severity: 500, // ERROR
        timestamp,
      })
    })
  }

  protected getErrorData(req: Request, options: CORSOptions): Partial<HTTPLoggingData> {
    return {
      error: {
        message: 'Not allowed by CORS.',
        detail: {
          requestOrigin: (req.headers.origin as string) || '',
          allowedBlankOrigin: !!options.allowedBlankOrigin,
          whitelist: options.whitelist,
        },
      },
    }
  }
}

class ProdCORSService extends CORSService {}

class DevCORSService extends CORSService {
  protected get defaultOptions(): CORSOptions {
    return {
      ...super.defaultOptions,
      allowedBlankOrigin: true,
    }
  }

  protected logNotAllowed(context: { req: Request; res: Response; info?: GraphQLResolveInfo }, options: CORSOptions) {
    const { req, res, info } = context
    const data = {
      functionName: this.loggingService.getFunctionName({ req, info }),
      ...this.getErrorData(req, options),
    }
    console.error('[ERROR]:', JSON.stringify(data, null, 2))
  }
}

class TestCORSService extends CORSService {
  protected logNotAllowed(context: { req: Request; res: Response; info?: GraphQLResolveInfo }, options: CORSOptions) {}
}

namespace CORSServiceDI {
  export const symbol = Symbol(CORSService.name)
  export const provider = {
    provide: symbol,
    useClass: (() => {
      if (process.env.NODE_ENV === 'production') {
        return ProdCORSService
      } else if (process.env.NODE_ENV === 'test') {
        return TestCORSService
      } else {
        return DevCORSService
      }
    })(),
  }
  export type type = CORSService
}

@Module({
  providers: [CORSServiceDI.provider],
  exports: [CORSServiceDI.provider],
  imports: [HTTPLoggingServiceModule],
})
class CORSServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { CORSServiceDI, CORSServiceModule }
