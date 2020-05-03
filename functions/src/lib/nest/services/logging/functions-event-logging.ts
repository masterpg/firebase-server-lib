import { HttpException, Injectable, Module } from '@nestjs/common'
import { InputValidationError, ValidationErrors } from '../../../base'
import { Log, Logging } from '@google-cloud/logging'
import { clone, merge } from 'lodash'
import { LogEntry } from '@google-cloud/logging/build/src/entry'
import { google } from '@google-cloud/logging/build/protos/protos'
import IMonitoredResource = google.api.IMonitoredResource

//========================================================================
//
//  Interfaces
//
//========================================================================

interface FunctionsEventLoggingSource {
  functionName: string
  logName?: string
  error?: Error
  metadata?: Partial<FunctionsEventLoggingMetadata>
  data?: Partial<FunctionsEventLoggingData>
}

interface FunctionsEventLoggingMetadata extends LogEntry {
  resource: FunctionsEventLoggingResourceData
}

interface FunctionsEventLoggingResourceData extends IMonitoredResource {
  type: string
  labels: {
    function_name: string
  }
}

interface FunctionsEventLoggingData {
  user?: {
    uid: string
    customClaims?: any
  }
  error?: {
    message: string
    detail?: any
  }
}

//========================================================================
//
//  Implementation
//
//========================================================================

const DEFAULT_LOG_NAME = 'handler'

abstract class FunctionsEventLoggingService {
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

  async log(loggingSource: FunctionsEventLoggingSource): Promise<void> {
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

  protected getBaseMetadata(loggingSource: { functionName: string }): FunctionsEventLoggingMetadata {
    return {
      resource: this.m_getResourceData(loggingSource),
    }
  }

  protected getData(loggingSource: { data?: Partial<FunctionsEventLoggingData>; error?: Error }): FunctionsEventLoggingData {
    const data = clone(loggingSource.data)
    const error = loggingSource.error

    const result = {} as FunctionsEventLoggingData

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

  private m_writeLog(logName: string, metadata?: LogEntry, data?: string | FunctionsEventLoggingData) {
    let targetLog = this.m_logDict[logName]
    if (!targetLog) {
      targetLog = new Logging().log(logName)
      this.m_logDict[logName] = targetLog
    }
    const entry = targetLog.entry(metadata, data)
    return targetLog.write(entry)
  }

  private m_getResourceData(loggingSource: { functionName: string }): FunctionsEventLoggingResourceData {
    const { functionName } = loggingSource
    return {
      type: 'cloud_function',
      labels: {
        function_name: functionName,
      },
    }
  }
}

@Injectable()
class ProdFunctionsEventLoggingService extends FunctionsEventLoggingService {}

@Injectable()
class DevFunctionsEventLoggingService extends FunctionsEventLoggingService {
  async log(loggingSource: FunctionsEventLoggingSource): Promise<void> {
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
class TestFunctionsEventLoggingService extends FunctionsEventLoggingService {
  async log(loggingSource: FunctionsEventLoggingSource): Promise<void> {}
}

namespace FunctionsEventLoggingServiceDI {
  export const symbol = Symbol(FunctionsEventLoggingService.name)
  export const provider = {
    provide: symbol,
    useClass: (() => {
      if (process.env.NODE_ENV === 'production') {
        return ProdFunctionsEventLoggingService
      } else if (process.env.NODE_ENV === 'test') {
        return TestFunctionsEventLoggingService
      } else {
        return DevFunctionsEventLoggingService
      }
    })(),
  }
  export type type = FunctionsEventLoggingService
}

@Module({
  providers: [FunctionsEventLoggingServiceDI.provider],
  exports: [FunctionsEventLoggingServiceDI.provider],
})
class FunctionsEventLoggingServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export {
  FunctionsEventLoggingSource,
  FunctionsEventLoggingMetadata,
  FunctionsEventLoggingResourceData,
  FunctionsEventLoggingData,
  FunctionsEventLoggingServiceDI,
  FunctionsEventLoggingServiceModule,
}
