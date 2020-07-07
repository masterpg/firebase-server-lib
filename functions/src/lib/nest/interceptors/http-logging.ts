import { CallHandler, ExecutionContext, Inject, Module, NestInterceptor } from '@nestjs/common'
import { HTTPLoggingServiceDI, LoggingLatencyTimer } from '../services/logging'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { Observable } from 'rxjs'
import { getAllExecutionContext } from '../base'
import { tap } from 'rxjs/operators'
import dayjs = require('dayjs')
import onFinished = require('on-finished')

//========================================================================
//
//  Implementation
//
//========================================================================

class HTTPLoggingInterceptor implements NestInterceptor {
  constructor(@Inject(HTTPLoggingServiceDI.symbol) protected readonly loggingService: HTTPLoggingServiceDI.type) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const { req, res, info } = getAllExecutionContext(context)
    const latencyTimer = new LoggingLatencyTimer().start()
    const loggingSource = { req, res, info, latencyTimer }
    const executionId = this.loggingService.getExecutionId(req)

    return next.handle().pipe(
      tap(
        () => {
          const timestamp = dayjs()
          onFinished(res, () => {
            this.loggingService.log({ ...loggingSource, timestamp })
          })
        },
        error => {
          const timestamp = dayjs()
          onFinished(res, () => {
            this.loggingService.log({ ...loggingSource, error, executionId, timestamp })
          })
        }
      )
    )
  }
}

namespace HTTPLoggingAppInterceptorDI {
  export const provider = {
    provide: APP_INTERCEPTOR,
    useClass: HTTPLoggingInterceptor,
  }
}

@Module({
  providers: [HTTPLoggingServiceDI.provider],
  exports: [HTTPLoggingServiceDI.provider],
})
class HTTPLoggingInterceptorModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { HTTPLoggingAppInterceptorDI, HTTPLoggingInterceptorModule }
