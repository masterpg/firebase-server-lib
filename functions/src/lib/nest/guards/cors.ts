import { CanActivate, ExecutionContext, Inject, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { CORSServiceDI } from '../services/cors'
import { HttpLoggingServiceDI } from '../services/logging'
import { getAllExecutionContext } from '../base'

class CORSGuard implements CanActivate {
  constructor(@Inject(CORSServiceDI.symbol) protected readonly corsService: CORSServiceDI.type) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allContext = getAllExecutionContext(context)
    return this.corsService.validate(allContext)
  }
}

export namespace CORSAppGuardDI {
  export const provider = {
    provide: APP_GUARD,
    useClass: CORSGuard,
  }
}

@Module({
  providers: [CORSServiceDI.provider, HttpLoggingServiceDI.provider],
  exports: [CORSServiceDI.provider, HttpLoggingServiceDI.provider],
})
export class CORSGuardModule {}
