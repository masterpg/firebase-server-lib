import { Inject, Injectable } from '@nestjs/common'
import { EventContext } from 'firebase-functions'
import { StorageServiceDI } from './storage'
import { UserRecord } from 'firebase-functions/lib/providers/auth'

@Injectable()
class HandlersService {
  constructor(@Inject(StorageServiceDI.symbol) protected readonly storageService: StorageServiceDI.type) {}

  async onCreateUser(user: UserRecord, context: EventContext): Promise<void> {
    await this.storageService.assignUserStorageDir(user)
  }

  async onDeleteUser(user: UserRecord, context: EventContext): Promise<void> {
    const userDirPath = this.storageService.getUserStorageDirPath(user)
    await this.storageService.removeStorageDir(userDirPath)
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
