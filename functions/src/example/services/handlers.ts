import { Inject, Injectable } from '@nestjs/common'
import { EventContext } from 'firebase-functions'
import { HandlerLoggingServiceDI } from '../../lib'
import { StorageServiceDI } from './storage'
import { UserRecord } from 'firebase-functions/lib/providers/auth'

@Injectable()
class HandlersService {
  constructor(
    @Inject(StorageServiceDI.symbol) protected readonly storageService: StorageServiceDI.type,
    @Inject(HandlerLoggingServiceDI.symbol) protected readonly loggingService: HandlerLoggingServiceDI.type
  ) {}

  async onCreateUser(user: UserRecord, context: EventContext): Promise<void> {
    let error: Error | undefined
    try {
      await this.storageService.assignUserStorageDir(user)
    } catch (err) {
      error = err
    }
    await this.loggingService.log({ functionName: 'onCreateUser', data: { user }, error })
  }

  async onDeleteUser(user: UserRecord, context: EventContext): Promise<void> {
    let error: Error | undefined
    try {
      const userDirPath = this.storageService.getUserStorageDirPath(user)
      await this.storageService.removeStorageDirs([userDirPath])
    } catch (err) {
      error = err
    }
    await this.loggingService.log({ functionName: 'onDeleteUser', data: { user }, error })
  }
}

export namespace HandlersServiceDI {
  export const symbol = Symbol(HandlersService.name)
  export const provider = {
    provide: symbol,
    useClass: HandlersService,
  }
  export type type = HandlersService
}
