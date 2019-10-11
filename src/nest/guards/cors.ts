import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { CORSServiceDI } from '../../services/base'
import { getAllExecutionContext } from '../utils'

class CORSGuard implements CanActivate {
  constructor(@Inject(CORSServiceDI.symbol) protected readonly corsService: CORSServiceDI.type) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allContext = getAllExecutionContext(context)
    return this.corsService.validate(allContext)
  }
}

export namespace CORSGuardDI {
  export const provider = {
    provide: APP_GUARD,
    useClass: CORSGuard,
  }
}
