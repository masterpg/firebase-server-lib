import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common'
import { HTTPLoggingServiceDI, LoggingLatencyTimer } from '../services/logging'
import { AuthServiceDI } from '../services/auth'
import { Reflector } from '@nestjs/core'
import { getAllExecutionContext } from '../base'
import onFinished = require('on-finished')
import dayjs = require('dayjs')

//========================================================================
//
//  Implementation
//
//========================================================================

@Injectable()
class AuthGuard implements CanActivate {
  constructor(
    protected readonly reflector: Reflector,
    @Inject(AuthServiceDI.symbol) protected readonly authService: AuthServiceDI.type,
    @Inject(HTTPLoggingServiceDI.symbol) protected readonly loggingService: HTTPLoggingServiceDI.type
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.get<string[]>('roles', context.getHandler())
    const { req, res, info } = getAllExecutionContext(context)
    const latencyTimer = new LoggingLatencyTimer().start()

    const validated = await this.authService.validate(req, res, roles)
    if (validated.result) {
      ;(req as any).__idToken = validated.idToken
      return true
    } else {
      const error = validated.error
      const timestamp = dayjs()
      onFinished(res, () => {
        this.loggingService.log({ req, res, info, latencyTimer, error, timestamp })
      })
      throw error
    }
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export { AuthGuard }
