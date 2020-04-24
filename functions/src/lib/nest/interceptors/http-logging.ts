import { CallHandler, ExecutionContext, Inject, Module, NestInterceptor } from '@nestjs/common'
import { HttpLoggingServiceDI, LoggingLatencyTimer } from '../services/logging'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { Observable } from 'rxjs'
import { getAllExecutionContext } from '../base'
import { tap } from 'rxjs/operators'

class HttpLoggingInterceptor implements NestInterceptor {
  constructor(@Inject(HttpLoggingServiceDI.symbol) protected readonly loggingService: HttpLoggingServiceDI.type) {}

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

export namespace HttpLoggingAppInterceptorDI {
  export const provider = {
    provide: APP_INTERCEPTOR,
    useClass: HttpLoggingInterceptor,
  }
}

@Module({
  providers: [HttpLoggingServiceDI.provider],
  exports: [HttpLoggingServiceDI.provider],
})
export class HttpLoggingInterceptorModule {}
