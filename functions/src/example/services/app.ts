import { Inject, Injectable } from '@nestjs/common'
import { BaseAppService } from '../../lib'
import { StorageServiceDI } from './storage'

@Injectable()
class AppService extends BaseAppService {
  @Inject(StorageServiceDI.symbol)
  protected readonly storageService!: StorageServiceDI.type
}

export namespace AppServiceDI {
  export const symbol = Symbol(AppService.name)
  export const provider = {
    provide: symbol,
    useClass: AppService,
  }
  export type type = AppService
}
