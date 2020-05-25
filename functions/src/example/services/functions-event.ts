import { FunctionsEventLoggingServiceDI, FunctionsEventLoggingServiceModule } from '../../lib/nest'
import { Inject, Injectable, Module } from '@nestjs/common'
import { UserServiceDI, UserServiceModule } from '../../lib/services'
import { EventContext } from 'firebase-functions'
import { UserRecord } from 'firebase-functions/lib/providers/auth'

//========================================================================
//
//  Implementation
//
//========================================================================

@Injectable()
class FunctionsEventService {
  constructor(
    @Inject(UserServiceDI.symbol) protected readonly userService: UserServiceDI.type,
    @Inject(FunctionsEventLoggingServiceDI.symbol) protected readonly loggingService: FunctionsEventLoggingServiceDI.type
  ) {}

  async authOnCreateUser(user: UserRecord, context: EventContext): Promise<void> {
    await this.loggingService.log({ functionName: 'authOnCreateUser', data: { user } })
  }

  async authOnDeleteUser(user: UserRecord, context: EventContext): Promise<void> {
    let error: Error | undefined
    try {
      await this.userService.deleteUser(user.uid)
    } catch (err) {
      error = err
    }
    await this.loggingService.log({ functionName: 'authOnDeleteUser', data: { user }, error })
  }
}

namespace FunctionsEventDI {
  export const symbol = Symbol(FunctionsEventService.name)
  export const provider = {
    provide: symbol,
    useClass: FunctionsEventService,
  }
  export type type = FunctionsEventService
}

@Module({
  providers: [FunctionsEventDI.provider],
  exports: [FunctionsEventDI.provider],
  imports: [UserServiceModule, FunctionsEventLoggingServiceModule],
})
class FunctionsEventServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { FunctionsEventDI, FunctionsEventServiceModule }
