import { Injectable, Module } from '@nestjs/common'
import { AuthServiceModule } from '../../lib/nest'
import { StorageService } from '../../lib/services'

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
