import { LibStorageService, LibStorageServiceDI } from '../../lib'
import { Injectable } from '@nestjs/common'

@Injectable()
class StorageService extends LibStorageService {}

export namespace StorageServiceDI {
  export const symbol = LibStorageServiceDI.symbol
  export const provider = {
    provide: symbol,
    useClass: StorageService,
  }
  export type type = StorageService
}
