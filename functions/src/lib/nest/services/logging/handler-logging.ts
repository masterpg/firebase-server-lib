import { HttpException, Injectable } from '@nestjs/common'
import { InputValidationError, ValidationErrors } from '../../../base'
import { Log, Logging } from '@google-cloud/logging'
import { LogEntry } from '@google-cloud/logging/build/src/entry'
import { google } from '@google-cloud/logging/build/protos/protos'
import IMonitoredResource = google.api.IMonitoredResource
const merge = require('lodash/merge')
const clone = require('lodash/clone')

//========================================================================
//
//  Basis
//
//========================================================================

export interface HandlerLoggingSource {
  functionName: string
  logName?: string
  error?: Error
  metadata?: Partial<HandlerLoggingMetadata>
  data?: Partial<HandlerLoggingData>
}

export interface HandlerLoggingMetadata extends LogEntry {
  resource: HandlerLoggingResourceData
}

export interface HandlerLoggingResourceData extends IMonitoredResource {
  type: string
  labels: {
    function_name: string
  }
}

export interface HandlerLoggingData {
  user?: {
    uid: string
    customClaims?: any
  }
  error?: {
    message: string
    detail?: any
  }
}

const DEFAULT_LOG_NAME = 'handler'

abstract class HandlerLoggingService {
  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  private m_logMap: { [logName: string]: Log } = {}

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  async log(loggingSource: HandlerLoggingSource): Promise<void> {
    const { logName, error, metadata } = loggingSource

    const realMetadata = this.getBaseMetadata(loggingSource) as LogEntry
    if (!error) {
      merge(realMetadata, {
        severity: 100, // DEBUG
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

    await this.m_writeLog(logName ? logName : DEFAULT_LOG_NAME, realMetadata, data)
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  protected getBaseMetadata(loggingSource: { functionName: string }): HandlerLoggingMetadata {
    return {
      resource: this.m_getResourceData(loggingSource),
    }
  }

  protected getData(loggingSource: { data?: Partial<HandlerLoggingData>; error?: Error }): HandlerLoggingData {
    const data = clone(loggingSource.data)
    const error = loggingSource.error

    const result = {} as HandlerLoggingData

    if (data) {
      if (data.user) {
        result.user = {
          uid: data.user.uid,
          customClaims: data.user.customClaims,
        }
        delete data.user
      }
    }

    if (error) {
      if (error instanceof HttpException) {
        result.error = {
          message: (error.getResponse() as any).message,
        }
      } else {
        result.error = {
          message: error.message,
        }
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

  private m_writeLog(logName: string, metadata?: LogEntry, data?: string | HandlerLoggingData) {
    let targetLog = this.m_logMap[logName]
    if (!targetLog) {
      targetLog = new Logging().log(logName)
      this.m_logMap[logName] = targetLog
    }
    const entry = targetLog.entry(metadata, data)
    return targetLog.write(entry)
  }

  private m_getResourceData(loggingSource: { functionName: string }): HandlerLoggingResourceData {
    const { functionName } = loggingSource
    return {
      type: 'cloud_function',
      labels: {
        function_name: functionName,
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
class ProdHandlerLoggingService extends HandlerLoggingService {}

@Injectable()
class DevHandlerLoggingService extends HandlerLoggingService {
  async log(loggingSource: HandlerLoggingSource): Promise<void> {
    const { error } = loggingSource
    const functionName = this.getBaseMetadata(loggingSource).resource.labels.function_name
    const detail = {
      functionName,
    }

    if (!error) {
      console.log('[DEBUG]:', JSON.stringify(detail, null, 2))
    } else {
      const errorData = this.getData(loggingSource)
      console.error('[ERROR]:', JSON.stringify(errorData, null, 2))
    }
  }
}

@Injectable()
class TestHandlerLoggingService extends HandlerLoggingService {
  async log(loggingSource: HandlerLoggingSource): Promise<void> {}
}

export namespace HandlerLoggingServiceDI {
  export const symbol = Symbol(HandlerLoggingService.name)
  export const provider = {
    provide: symbol,
    useClass: (() => {
      if (process.env.NODE_ENV === 'production') {
        return ProdHandlerLoggingService
      } else if (process.env.NODE_ENV === 'test') {
        return TestHandlerLoggingService
      } else {
        return DevHandlerLoggingService
      }
    })(),
  }
  export type type = HandlerLoggingService
}
