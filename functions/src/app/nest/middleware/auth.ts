import { Inject, Injectable, NestMiddleware } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'
import { AuthServiceDI } from '../../services'

//========================================================================
//
//  Implementation
//
//========================================================================

@Injectable()
class AuthMiddleware implements NestMiddleware {
  constructor(@Inject(AuthServiceDI.symbol) protected readonly authService: AuthServiceDI.type) {}

  use(req: Request, res: Response, next: NextFunction) {
    this.authService.getIdToken(req).then(idToken => {
      if (idToken) {
        ;(req as any).__idToken = idToken
      }
      next()
    })
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export { AuthMiddleware }
