import { AuthServiceModule, LibStorageService, LibStorageServiceDI } from '../../lib'
import { Injectable, Module } from '@nestjs/common'

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

@Module({
  providers: [StorageServiceDI.provider],
  exports: [StorageServiceDI.provider],
  imports: [AuthServiceModule],
})
export class StorageServiceModule {}
