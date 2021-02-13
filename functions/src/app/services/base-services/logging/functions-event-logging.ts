import { AppError, ValidationErrors } from '../../../base'
import { clone, merge } from 'lodash'
import { debug, error, info, warn } from 'firebase-functions/lib/logger'
import { LoggingSeverity } from './base'
import { config } from '../../../../config'

//========================================================================
//
//  Interfaces
//
//========================================================================

interface FunctionsEventLoggingSource {
  functionName: string
  error?: Error
  data?: any
  severity?: LoggingSeverity
}

interface FunctionsEventLoggingData {
  error?: any
}

//========================================================================
//
//  Implementation
//
//========================================================================

abstract class FunctionsEventLoggingService {
  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  log(loggingSource: FunctionsEventLoggingSource): void {
    const data = this.getData(loggingSource)

    if (typeof loggingSource.severity === 'number') {
      switch (loggingSource.severity) {
        case LoggingSeverity.DEBUG:
          debug(data)
          break
        case LoggingSeverity.INFO:
          info(data)
          break
        case LoggingSeverity.WARNING:
          warn(data)
          break
        case LoggingSeverity.ERROR:
          error(data)
          break
      }
    } else {
      debug(data)
    }
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  protected getData(loggingSource: FunctionsEventLoggingSource): FunctionsEventLoggingData {
    const data = clone(loggingSource.data)
    const error = loggingSource.error

    const result: FunctionsEventLoggingData = {}

    if (error) {
      if (error instanceof Error) {
        result.error = {
          message: error.message,
        }

        if (error instanceof AppError) {
          result.error.detail = {
            cause: error.cause,
            data: error.data,
          }
        }

        if (error instanceof ValidationErrors) {
          result.error.details = error.details
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
}

class ProdFunctionsEventLoggingService extends FunctionsEventLoggingService {}

class DevFunctionsEventLoggingService extends FunctionsEventLoggingService {
  log(loggingSource: FunctionsEventLoggingSource): void {
    const { functionName, error } = loggingSource
    const detail: any = {
      functionName,
    }

    if (error) {
      const errorData = this.getData(loggingSource)
      console.error('[ERROR]:', JSON.stringify(errorData, null, 2))
    } else {
      detail.data = this.getData(loggingSource)
      console.log('[DEBUG]:', JSON.stringify(detail, null, 2))
    }
  }
}

class TestFunctionsEventLoggingService extends FunctionsEventLoggingService {
  log(loggingSource: FunctionsEventLoggingSource): void {}
}

namespace FunctionsEventLoggingServiceDI {
  export const symbol = Symbol(FunctionsEventLoggingService.name)
  export const provider = {
    provide: symbol,
    useClass: (() => {
      if (config.env.mode === 'prod') {
        return ProdFunctionsEventLoggingService
      } else if (config.env.mode === 'test') {
        return TestFunctionsEventLoggingService
      } else {
        return DevFunctionsEventLoggingService
      }
    })(),
  }
  export type type = FunctionsEventLoggingService
}

//========================================================================
//
//  Exports
//
//========================================================================

export { FunctionsEventLoggingSource, FunctionsEventLoggingData, FunctionsEventLoggingServiceDI }
