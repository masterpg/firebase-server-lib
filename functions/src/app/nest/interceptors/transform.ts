import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

//========================================================================
//
//  Interfaces
//
//========================================================================

export interface Response<T> {
  data: T
}

//========================================================================
//
//  Implementation
//
//========================================================================

@Injectable()
class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<Response<T>> {
    return next.handle().pipe(map(data => ({ data })))
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export { TransformInterceptor }
