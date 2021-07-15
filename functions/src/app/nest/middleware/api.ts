import { Injectable, NestMiddleware } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'
import { APIVersion } from 'web-base-lib'

//========================================================================
//
//  Implementation
//
//========================================================================

@Injectable()
class APIMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    res.setHeader('Access-Control-Expose-Headers', 'X-API-Version')
    res.setHeader('X-API-Version', APIVersion)
    next()
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export { APIMiddleware }
