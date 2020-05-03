import { CanActivate, ExecutionContext, Inject, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { CORSServiceDI } from '../services/cors'
import { HTTPLoggingServiceDI } from '../services/logging'
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

@Module({
  providers: [CORSServiceDI.provider, HTTPLoggingServiceDI.provider],
  exports: [CORSServiceDI.provider, HTTPLoggingServiceDI.provider],
})
class CORSGuardModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { CORSAppGuardDI, CORSGuardModule }
