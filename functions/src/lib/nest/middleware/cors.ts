import { Inject, Injectable, Module, NestMiddleware } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'
import { CORSServiceDI } from '../services/cors'
import { HTTPLoggingServiceDI } from '../services/logging'

//========================================================================
//
//  Implementation
//
//========================================================================

@Injectable()
class CORSMiddleware implements NestMiddleware {
  constructor(@Inject(CORSServiceDI.symbol) protected readonly corsService: CORSServiceDI.type) {}

  use(req: Request, res: Response, next: NextFunction) {
    this.corsService.validate({ req, res }, next, { isLogging: true })
  }
}

@Module({
  providers: [CORSServiceDI.provider, HTTPLoggingServiceDI.provider],
  exports: [CORSServiceDI.provider, HTTPLoggingServiceDI.provider],
})
class CORSMiddlewareModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { CORSMiddleware, CORSMiddlewareModule }
