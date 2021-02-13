import * as path from 'path'
import { AppError, ValidationErrors } from '../../../base'
import { Log, Logging } from '@google-cloud/logging'
import { LoggingLatencyTimer, LoggingSeverity } from './base'
import { Request, Response } from 'express'
import { ApiResponse } from '@google-cloud/logging/build/src/log'
import { Dayjs } from 'dayjs'
import { ResponseError as ElasticResponseError } from '@elastic/elasticsearch/lib/errors'
import { GraphQLResolveInfo } from 'graphql'
import { HttpException } from '@nestjs/common'
import { IdToken } from '../../base'
import { LogEntry } from '@google-cloud/logging/build/src/entry'
import { config } from '../../../../config'
import { google } from '@google-cloud/logging/build/protos/protos'
import { merge } from 'lodash'
import { removeBothEndsSlash } from 'web-base-lib'
import IHttpRequest = google.logging.type.IHttpRequest
import IMonitoredResource = google.api.IMonitoredResource
import dayjs = require('dayjs')

//========================================================================
//
//  Interfaces
//
//========================================================================

interface HTTPLoggingSource {
  req: Request
  res: Response
  latencyTimer?: LoggingLatencyTimer
  logName?: string
  info?: GraphQLResolveInfo
  error?: Error | any
  severity?: LoggingSeverity
  timestamp?: Dayjs
}

interface HTTPLoggingMetadata extends LogEntry {
  resource: HTTPLoggingResourceData
  httpRequest: IHttpRequest
}

interface HTTPLoggingResourceData extends IMonitoredResource {
  type: string
  labels: {
    function_name: string
    region: string
  }
}

interface HTTPLoggingData {
  gql?: any
  user?: {
    uid: string
  }
  error?: any
}

//========================================================================
//
//  Implementation
//
//========================================================================

const DEFAULT_LOG_NAME = 'api'

abstract class HTTPLoggingService {
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

  log(loggingSource: HTTPLoggingSource): void {
    const { logName, req, res, error, severity, timestamp } = loggingSource

    const realMetadata = this.getBaseMetadata(loggingSource) as LogEntry
    if (error) {
      merge(realMetadata, {
        severity: LoggingSeverity.ERROR,
      })
    } else {
      merge(realMetadata, {
        severity: LoggingSeverity.DEBUG,
        httpRequest: {
          responseSize: parseInt(res.get('Content-Length')),
        },
      })
    }

    const data = this.getData(loggingSource)

    if (typeof severity === 'number') {
      realMetadata.severity = severity as number
    }

    if (timestamp) {
      realMetadata.timestamp = timestamp.toDate()
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
      segment = `${this.getBaseFunctionName(req)}`
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
  }): HTTPLoggingMetadata {
    const { req, info } = loggingSource
    return {
      resource: this.m_getResourceData(loggingSource),
      httpRequest: this.m_getRequestData(loggingSource),
      timestamp: dayjs().toDate(),
      labels: {
        execution_id: req.header('Function-Execution-Id') || '',
      },
    }
  }

  protected getData(loggingSource: { req: Request; info?: GraphQLResolveInfo; data?: HTTPLoggingData; error?: Error }): HTTPLoggingData {
    const { req, info, data, error } = loggingSource

    const result = {} as HTTPLoggingData

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
      if (error instanceof Error) {
        result.error = { message: '', stack: error.stack }
        if (error instanceof HttpException) {
          result.error.message = (error.getResponse() as any).message
        } else {
          result.error.message = error.message
        }

        if (error instanceof AppError) {
          result.error.detail = {
            cause: error.cause,
            data: error.data,
          }
        } else if (error instanceof ValidationErrors) {
          result.error.details = error.details
        } else if (error instanceof ElasticResponseError) {
          result.error.detail = error.meta.body.error
        }
      } else {
        result.error = error
      }
    }

    if (data) {
      merge(result, data)
    }

    return result
  }

  private m_writeLog(logName: string, metadata?: LogEntry, data?: string | HTTPLoggingData): Promise<ApiResponse> {
    let targetLog = this.m_logDict[logName]
    if (!targetLog) {
      targetLog = new Logging().log(logName)
      this.m_logDict[logName] = targetLog
    }
    const entry = targetLog.entry(metadata, data)
    return targetLog.write(entry)
  }

  private m_getResourceData(loggingSource: { req: Request; info?: GraphQLResolveInfo }): HTTPLoggingResourceData {
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

class ProdHTTPLoggingService extends HTTPLoggingService {
  protected getBaseFunctionName(req: Request): string {
    return String(process.env.FUNCTION_TARGET)
  }
}

class DevHTTPLoggingService extends HTTPLoggingService {
  log(loggingSource: HTTPLoggingSource): void {
    const { latencyTimer, error } = loggingSource
    const functionName = this.getBaseMetadata(loggingSource).resource.labels.function_name
    const detail = {
      functionName,
      latency: latencyTimer ? `${latencyTimer.diff.seconds}s` : undefined,
    }

    if (error) {
      const errorData = this.getData(loggingSource)
      console.error('[ERROR]:', JSON.stringify(errorData, null, 2))
    } else {
      console.log('[DEBUG]:', JSON.stringify(detail, null, 2))
    }
  }

  protected getBaseFunctionName(req: Request): string {
    // 例:
    //   req.baseUrl: '/lived-web-app-b9f08/asia-northeast1/cartRESTService'
    //   → 'cartRESTService'
    const segments = removeBothEndsSlash(req.baseUrl).split('/')
    return segments[segments.length - 1]
  }
}

class TestHTTPLoggingService extends HTTPLoggingService {
  log(loggingSource: HTTPLoggingSource): void {}

  protected getBaseFunctionName(req: Request): string {
    return ''
  }
}

namespace HTTPLoggingServiceDI {
  export const symbol = Symbol(HTTPLoggingService.name)
  export const provider = {
    provide: symbol,
    useClass: (() => {
      if (config.env.mode === 'prod') {
        return ProdHTTPLoggingService
      } else if (config.env.mode === 'test') {
        return TestHTTPLoggingService
      } else {
        return DevHTTPLoggingService
      }
    })(),
  }
  export type type = HTTPLoggingService
}

//========================================================================
//
//  Exports
//
//========================================================================

export { HTTPLoggingSource, HTTPLoggingMetadata, HTTPLoggingResourceData, HTTPLoggingData, HTTPLoggingServiceDI }
