import { AuthServiceModule, LibStorageService, LibStorageServiceDI } from '../../lib'
import { Injectable, Module } from '@nestjs/common'

//========================================================================
//
//  Implementation
//
//========================================================================

@Injectable()
class StorageService extends LibStorageService {}

namespace StorageServiceDI {
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
class StorageServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { StorageNode, StorageNodeShareSettings } from '../../lib'
export { StorageServiceDI, StorageServiceModule }
