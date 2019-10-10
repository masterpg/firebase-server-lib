import { Inject, Injectable, NestMiddleware } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'
import { CORSServiceDI } from '../../services/base'

@Injectable()
export class CORSMiddleware implements NestMiddleware {
  constructor(@Inject(CORSServiceDI.symbol) protected readonly corsService: CORSServiceDI.type) {}

  use(req: Request, res: Response, next: NextFunction) {
    this.corsService.validate({ req, res }, next, { isLogging: true })
  }
}
