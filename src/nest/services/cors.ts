import * as vary from 'vary'
import { Inject, Injectable } from '@nestjs/common'
import { LoggingData, LoggingLatencyTimer, LoggingServiceDI } from './logging'
import { NextFunction, Request, Response } from 'express'
import { GraphQLResolveInfo } from 'graphql'
import { config } from '../../base'

//========================================================================
//
//  Basis
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

abstract class CORSService {
  //----------------------------------------------------------------------
  //
  //  Constructor
  //
  //----------------------------------------------------------------------

  constructor(@Inject(LoggingServiceDI.symbol) protected readonly loggingService: LoggingServiceDI.type) {}

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
      allowedBlankOrigin: false,
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
      !isAllowed && this.logNotAllowed(context, options)
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
    const requestOrigin = (req.headers.origin as string) || ''
    const whitelist = options.whitelist || []

    // リクエストオリジンの空を許容していて、かつリクエストオリジンが空の場合
    if (options.allowedBlankOrigin && !requestOrigin) {
      return true
    }

    // ホワイトリストが指定されていない場合
    if (whitelist.length === 0) {
      return false
    }

    // ホワイトリストが指定されている場合、
    // リクエストオリジンがホワイトリストに含まれていることを検証
    return whitelist.indexOf(requestOrigin) >= 0
  }

  protected configureOrigin(options: CORSOptions, req: Request) {
    const headers: any = []
    const whitelist = options.whitelist || []
    const requestOrigin = (req.headers.origin as string) || ''

    // リクエストオリジンの空を許容していて、かつリクエストオリジンが空の場合
    if (options.allowedBlankOrigin && !requestOrigin) {
      headers.push({ key: 'Access-Control-Allow-Origin', value: '*' })
      return headers
    }

    // リクエストオリジンがホワイトリストに含まれている場合
    if (whitelist.length > 0 && whitelist.indexOf(requestOrigin) >= 0) {
      headers.push({ key: 'Access-Control-Allow-Origin', value: requestOrigin })
      headers.push({ key: 'Vary', value: 'Origin' })
    }
    // リクエストオリジンがホワイトリストに含まれていない場合
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
      // リクエストヘッダーの'access-control-request-headers'指定された値を
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
    res.on('finish', () => {
      this.loggingService.log({
        req,
        res,
        info,
        latencyTimer,
        metadata: {
          severity: 500, // ERROR
        },
        data: this.getErrorData(req, options),
      })
    })
  }

  protected getErrorData(req: Request, options: CORSOptions): Partial<LoggingData> {
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

//========================================================================
//
//  Concrete
//
//========================================================================

@Injectable()
class ProdCORSService extends CORSService {}

@Injectable()
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

@Injectable()
class TestCORSService extends CORSService {
  protected logNotAllowed(context: { req: Request; res: Response; info?: GraphQLResolveInfo }, options: CORSOptions) {}
}

export namespace CORSServiceDI {
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
