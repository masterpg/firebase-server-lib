import { Injectable, Module } from '@nestjs/common'
import { LibStorageService, LibStorageServiceDI } from '../../lib/services'
import { AuthServiceModule } from '../../lib/nest'

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

export { StorageServiceDI, StorageServiceModule }
