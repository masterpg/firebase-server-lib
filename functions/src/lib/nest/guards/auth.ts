import { CanActivate, ExecutionContext, Inject, Injectable, Module } from '@nestjs/common'
import { HTTPLoggingServiceDI, LoggingLatencyTimer } from '../services/logging'
import { AuthServiceDI } from '../services/auth'
import { Reflector } from '@nestjs/core'
import { getAllExecutionContext } from '../base'

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
      res.on('finish', () => {
        this.loggingService.log({ req, res, info, latencyTimer, error: validated.error })
      })
      throw validated.error
    }
  }
}

@Module({
  providers: [AuthServiceDI.provider, HTTPLoggingServiceDI.provider],
  exports: [AuthServiceDI.provider, HTTPLoggingServiceDI.provider],
})
class AuthGuardModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { AuthGuard, AuthGuardModule }
