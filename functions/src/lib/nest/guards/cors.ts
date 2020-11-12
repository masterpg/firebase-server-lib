import { CanActivate, ExecutionContext, Inject } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { CORSServiceDI } from '../../base-service'
import { getAllExecutionContext } from '../base'

//========================================================================
//
//  Implementation
//
//========================================================================

class CORSGuard implements CanActivate {
  constructor(@Inject(CORSServiceDI.symbol) protected readonly corsService: CORSServiceDI.type) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allContext = getAllExecutionContext(context)
    return this.corsService.validate(allContext)
  }
}

namespace CORSAppGuardDI {
  export const provider = {
    provide: APP_GUARD,
    useClass: CORSGuard,
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export { CORSAppGuardDI }
