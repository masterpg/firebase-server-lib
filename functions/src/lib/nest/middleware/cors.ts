import { Inject, Injectable, Module, NestMiddleware } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'
import { CORSServiceDI } from '../services/cors'
import { HttpLoggingServiceDI } from '../services/logging'

@Injectable()
export class CORSMiddleware implements NestMiddleware {
  constructor(@Inject(CORSServiceDI.symbol) protected readonly corsService: CORSServiceDI.type) {}

  use(req: Request, res: Response, next: NextFunction) {
    this.corsService.validate({ req, res }, next, { isLogging: true })
  }
}

@Module({
  providers: [CORSServiceDI.provider, HttpLoggingServiceDI.provider],
  exports: [CORSServiceDI.provider, HttpLoggingServiceDI.provider],
})
export class CORSMiddlewareModule {}
