import { AuthServiceDI, LoggingLatencyTimer, LoggingServiceDI } from '../../services/base'
import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { getAllExecutionContext } from '../utils'

@Injectable()
export class UserGuard implements CanActivate {
  constructor(
    protected readonly reflector: Reflector,
    @Inject(AuthServiceDI.symbol) protected readonly authService: AuthServiceDI.type,
    @Inject(LoggingServiceDI.symbol) protected readonly loggingService: LoggingServiceDI.type
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.get<string[]>('roles', context.getHandler())
    const { req, res, info } = getAllExecutionContext(context)
    const latencyTimer = new LoggingLatencyTimer().start()

    const validated = await this.authService.validate(req, roles)
    if (validated.result) {
      ;(req as any).__idToken = validated.idToken
      return true
    } else {
      res.on('finish', () => {
        this.loggingService.log({ req, res, info, latencyTimer, error: new Error(validated.errorMessage) })
      })
      return false
    }
  }
}
