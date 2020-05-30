import { AuthServiceModule, StorageService } from '../../lib'
import { Injectable, Module } from '@nestjs/common'

//========================================================================
//
//  Implementation
//
//========================================================================

@Injectable()
class AppStorageService extends StorageService {}

namespace AppStorageServiceDI {
  export const symbol = Symbol(AppStorageService.name)
  export const provider = {
    provide: symbol,
    useClass: AppStorageService,
  }
  export type type = AppStorageService
}

@Module({
  providers: [AppStorageServiceDI.provider],
  exports: [AppStorageServiceDI.provider],
  imports: [AuthServiceModule],
})
class AppStorageServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { AppStorageServiceDI, AppStorageServiceModule }
