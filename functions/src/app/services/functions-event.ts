import { FunctionsEventLoggingServiceDI, LoggingServiceModule } from './base/logging'
import { Inject, Module } from '@nestjs/common'
import { StorageServiceDI, StorageServiceModule } from './storage'
import { UserServiceDI, UserServiceModule } from './user'
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
    @Inject(StorageServiceDI.symbol) protected readonly storageService: StorageServiceDI.type,
    @Inject(FunctionsEventLoggingServiceDI.symbol) protected readonly loggingService: FunctionsEventLoggingServiceDI.type
  ) {}

  async authOnCreateUser(user: UserRecord, context: EventContext): Promise<void> {
    this.loggingService.log({ functionName: 'authOnCreateUser', data: { user: this.m_toLogUser(user) } })
  }

  async authOnDeleteUser(user: UserRecord, context: EventContext): Promise<void> {
    let error: Error | undefined
    try {
      await this.userService.deleteUser(user.uid)
      await this.storageService.deleteUserDir(user.uid)
    } catch (err) {
      error = err
    }
    this.loggingService.log({ functionName: 'authOnDeleteUser', data: { user: this.m_toLogUser(user) }, error })
  }

  private m_toLogUser(user: UserRecord): { uid: string; customClaims: { [p: string]: any } | undefined } {
    return { uid: user.uid, customClaims: user.customClaims }
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
  imports: [UserServiceModule, StorageServiceModule, LoggingServiceModule],
})
class FunctionsEventServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { FunctionsEventDI, FunctionsEventServiceModule }
