import { BaseStorageService } from '../../lib/services'
import { Injectable } from '@nestjs/common'

@Injectable()
class StorageService extends BaseStorageService {}

export namespace StorageServiceDI {
  export const symbol = Symbol(StorageService.name)
  export const provider = {
    provide: symbol,
    useClass: StorageService,
  }
  export type type = StorageService
}
