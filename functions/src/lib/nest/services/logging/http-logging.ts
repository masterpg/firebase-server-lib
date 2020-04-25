import * as path from 'path'
import { HttpException, Injectable, Module } from '@nestjs/common'
import { InputValidationError, ValidationErrors } from '../../../base'
import { Log, Logging } from '@google-cloud/logging'
import { Request, Response } from 'express'
import { GraphQLResolveInfo } from 'graphql'
import { IdToken } from '../auth'
import { LogEntry } from '@google-cloud/logging/build/src/entry'
import { LoggingLatencyTimer } from './base'
import { config } from '../../../../config'
import { google } from '@google-cloud/logging/build/protos/protos'
import { merge } from 'lodash'
import { removeBothEndsSlash } from 'web-base-lib'
import IHttpRequest = google.logging.type.IHttpRequest
import IMonitoredResource = google.api.IMonitoredResource

//========================================================================
//
//  Basis
//
//========================================================================

export interface HttpLoggingSource {
  req: Request
  res: Response
  latencyTimer?: LoggingLatencyTimer
  logName?: string
  info?: GraphQLResolveInfo
  error?: Error
  metadata?: Partial<HttpLoggingMetadata>
  data?: Partial<HttpLoggingData>
}

export interface HttpLoggingMetadata extends LogEntry {
  resource: HttpLoggingResourceData
  httpRequest: IHttpRequest
}

export interface HttpLoggingResourceData extends IMonitoredResource {
  type: string
  labels: {
    function_name: string
    region: string
  }
}

export interface HttpLoggingData {
  gql?: any
  user?: {
    uid: string
  }
  error?: {
    message: string
    detail?: any
    stack?: any
  }
}

const DEFAULT_LOG_NAME = 'api'

abstract class HttpLoggingService {
  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  private m_logDict: { [logName: string]: Log } = {}

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  log(loggingSource: HttpLoggingSource): void {
    const { logName, req, res, error, metadata } = loggingSource

    const realMetadata = this.getBaseMetadata(loggingSource) as LogEntry
    if (!error) {
      merge(realMetadata, {
        severity: 100, // DEBUG
        labels: {
          execution_id: req.header('Function-Execution-Id'),
        },
        httpRequest: {
          responseSize: parseInt(res.get('Content-Length')),
        },
      })
    } else {
      merge(realMetadata, {
        severity: 500, // ERROR
      })
    }

    const data = this.getData(loggingSource)

    if (metadata) {
      merge(realMetadata, metadata)
    }

    this.m_writeLog(logName ? logName : DEFAULT_LOG_NAME, realMetadata, data)
  }

  getFunctionName(loggingSource: { req: Request; info?: GraphQLResolveInfo }): string {
    const { req, info } = loggingSource
    if (info) {
      // 例: function_name = 'cartService/cartItems'
      const segment1 = this.getBaseFunctionName(req)
      const segment2 = String(info.path.key)
      return removeBothEndsSlash(path.join(segment1, segment2))
    } else {
      // 例: function_name = 'cartRESTService/cartItems'
      const segment1 = this.getBaseFunctionName(req)
      const segment2 = req.path
      return removeBothEndsSlash(path.join(segment1, segment2))
    }
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  protected abstract getBaseFunctionName(req: Request): string

  protected getRequestUrl(req: Request, info?: GraphQLResolveInfo): string {
    let segment: string
    if (info) {
      segment = `${this.getBaseFunctionName(req)}/${String(info.path.key)}`
    } else {
      const originalUrl = removeBothEndsSlash(req.originalUrl)
      segment = `${this.getBaseFunctionName(req)}/${originalUrl}`
    }
    segment = removeBothEndsSlash(segment)
    return `${this.getProtocol(req)}://${req.headers.host}/${segment}`
  }

  protected getProtocol(req: Request): string {
    return req.get('X-Forwarded-Proto') || req.protocol
  }

  protected getBaseMetadata(loggingSource: {
    req: Request
    res: Response
    info?: GraphQLResolveInfo
    latencyTimer?: LoggingLatencyTimer
  }): HttpLoggingMetadata {
    const { req, info } = loggingSource
    return {
      resource: this.m_getResourceData(loggingSource),
      httpRequest: this.m_getRequestData(loggingSource),
    }
  }

  protected getData(loggingSource: { req: Request; info?: GraphQLResolveInfo; data?: Partial<HttpLoggingData>; error?: Error }): HttpLoggingData {
    const { req, info, data, error } = loggingSource

    const result = {} as HttpLoggingData

    if (info) {
      result.gql = req.body
    }

    const user = (req as any).__idToken as IdToken | undefined
    if (user) {
      result.user = {
        uid: user.uid,
      }
    }

    if (error) {
      result.error = { message: '', stack: error.stack }
      if (error instanceof HttpException) {
        result.error.message = (error.getResponse() as any).message
      } else {
        result.error.message = error.message
      }

      if (error instanceof ValidationErrors || error instanceof InputValidationError) {
        result.error.detail = error.detail
      }
    }

    if (data) {
      merge(result, data)
    }

    return result
  }

  private m_writeLog(logName: string, metadata?: LogEntry, data?: string | HttpLoggingData) {
    let targetLog = this.m_logDict[logName]
    if (!targetLog) {
      targetLog = new Logging().log(logName)
      this.m_logDict[logName] = targetLog
    }
    const entry = targetLog.entry(metadata, data)
    return targetLog.write(entry)
  }

  private m_getResourceData(loggingSource: { req: Request; info?: GraphQLResolveInfo }): HttpLoggingResourceData {
    const { req, info } = loggingSource
    return {
      type: 'cloud_function',
      labels: {
        function_name: this.getFunctionName(loggingSource),
        region: config.functions.region,
      },
    }
  }

  private m_getRequestData(loggingSource: {
    req: Request
    res: Response
    latencyTimer?: LoggingLatencyTimer
    info?: GraphQLResolveInfo
  }): IHttpRequest {
    const { req, res, latencyTimer, info } = loggingSource
    return {
      protocol: this.getProtocol(req),
      requestMethod: req.method,
      requestUrl: this.getRequestUrl(req, info),
      requestSize: parseInt(req.headers['content-length'] || ''),
      userAgent: req.headers['user-agent'],
      referer: req.headers.referer,
      remoteIp: req.ip || '',
      status: res.statusCode,
      latency: latencyTimer ? latencyTimer.stop().data : { seconds: 0, nanos: 0 },
    }
  }
}

//========================================================================
//
//  Concrete
//
//========================================================================

@Injectable()
class ProdHttpLoggingService extends HttpLoggingService {
  protected getBaseFunctionName(req: Request): string {
    return String(process.env.FUNCTION_TARGET)
  }
}

@Injectable()
class DevHttpLoggingService extends HttpLoggingService {
  log(loggingSource: HttpLoggingSource): void {
    const { latencyTimer, error } = loggingSource
    const functionName = this.getBaseMetadata(loggingSource).resource.labels.function_name
    const detail = {
      functionName,
      latency: latencyTimer ? `${latencyTimer.diff.seconds}s` : undefined,
    }

    if (!error) {
      console.log('[DEBUG]:', JSON.stringify(detail, null, 2))
    } else {
      const errorData = this.getData(loggingSource)
      console.error('[ERROR]:', JSON.stringify(errorData, null, 2))
    }
  }

  protected getBaseFunctionName(req: Request): string {
    // 例:
    //   req.baseUrl: '/vue-base-project-7295/asia-northeast1/cartRESTService'
    //   → 'cartRESTService'
    const segments = removeBothEndsSlash(req.baseUrl).split('/')
    return segments[segments.length - 1]
  }
}

@Injectable()
class TestHttpLoggingService extends HttpLoggingService {
  log(loggingSource: HttpLoggingSource): void {}

  protected getBaseFunctionName(req: Request): string {
    return ''
  }
}

export namespace HttpLoggingServiceDI {
  export const symbol = Symbol(HttpLoggingService.name)
  export const provider = {
    provide: symbol,
    useClass: (() => {
      if (process.env.NODE_ENV === 'production') {
        return ProdHttpLoggingService
      } else if (process.env.NODE_ENV === 'test') {
        return TestHttpLoggingService
      } else {
        return DevHttpLoggingService
      }
    })(),
  }
  export type type = HttpLoggingService
}

@Module({
  providers: [HttpLoggingServiceDI.provider],
  exports: [HttpLoggingServiceDI.provider],
})
export class HttpLoggingServiceModule {}
