import { AppStorageServiceDI, AppStorageServiceModule } from './storage'
import { FunctionsEventLoggingServiceDI, FunctionsEventLoggingServiceModule, UserServiceDI, UserServiceModule } from '../../lib'
import { Inject, Module } from '@nestjs/common'
import { EventContext } from 'firebase-functions'
import { UserRecord } from 'firebase-functions/lib/providers/auth'

//========================================================================
//
//  Implementation
//
//========================================================================

class FunctionsEventService {
  constructor(
    @Inject(UserServiceDI.symbol) protected readonly userService: UserServiceDI.type,
    @Inject(AppStorageServiceDI.symbol) protected readonly storageService: AppStorageServiceDI.type,
    @Inject(FunctionsEventLoggingServiceDI.symbol) protected readonly loggingService: FunctionsEventLoggingServiceDI.type
  ) {}

  async authOnCreateUser(user: UserRecord, context: EventContext): Promise<void> {
    await this.loggingService.log({ functionName: 'authOnCreateUser', data: { user } })
  }

  async authOnDeleteUser(user: UserRecord, context: EventContext): Promise<void> {
    let error: Error | undefined
    try {
      await this.storageService.deleteUserDir(user.uid)
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
  imports: [UserServiceModule, AppStorageServiceModule, FunctionsEventLoggingServiceModule],
})
class FunctionsEventServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { FunctionsEventDI, FunctionsEventServiceModule }
