import { FunctionsEventLoggingServiceDI, FunctionsEventLoggingServiceModule } from '../../lib'
import { Inject, Injectable, Module } from '@nestjs/common'
import { StorageServiceDI, StorageServiceModule } from './storage'
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
    @Inject(StorageServiceDI.symbol) protected readonly storageService: StorageServiceDI.type,
    @Inject(FunctionsEventLoggingServiceDI.symbol) protected readonly loggingService: FunctionsEventLoggingServiceDI.type
  ) {}

  async authOnCreateUser(user: UserRecord, context: EventContext): Promise<void> {
    await this.loggingService.log({ functionName: 'authOnCreateUser', data: { user } })
  }

  async authOnDeleteUser(user: UserRecord, context: EventContext): Promise<void> {
    let error: Error | undefined
    try {
      const userDirPath = this.storageService.getUserDirPath(user)
      await this.storageService.removeDir(null, userDirPath)
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
  imports: [StorageServiceModule, FunctionsEventLoggingServiceModule],
})
class FunctionsEventServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { FunctionsEventDI, FunctionsEventServiceModule }
