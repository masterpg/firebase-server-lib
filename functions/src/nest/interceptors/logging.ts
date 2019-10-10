import { CallHandler, ExecutionContext, Inject, NestInterceptor } from '@nestjs/common'
import { LoggingLatencyTimer, LoggingServiceDI } from '../../services/base'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { Observable } from 'rxjs'
import { getAllExecutionContext } from '../utils'
import { tap } from 'rxjs/operators'

class LoggingInterceptor implements NestInterceptor {
  constructor(@Inject(LoggingServiceDI.symbol) protected readonly loggingService: LoggingServiceDI.type) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const { req, res, info } = getAllExecutionContext(context)
    const latencyTimer = new LoggingLatencyTimer().start()
    const loggingSource = { req, res, info, latencyTimer }

    return next.handle().pipe(
      tap(
        () => {
          loggingSource.res.on('finish', () => {
            this.loggingService.log(loggingSource)
          })
        },
        error => {
          loggingSource.res.on('finish', () => {
            this.loggingService.log(Object.assign(loggingSource, { error }))
          })
        }
      )
    )
  }
}

export namespace LoggingInterceptorDI {
  export const provider = {
    provide: APP_INTERCEPTOR,
    useClass: LoggingInterceptor,
  }
}
