import { Inject, Injectable } from '@nestjs/common'
import { BaseAppService } from '../../../../src/lib/services'
import { MockStorageServiceDI } from './storage'

@Injectable()
class MockAppService extends BaseAppService {
  @Inject(MockStorageServiceDI.symbol)
  protected readonly storageService!: MockStorageServiceDI.type
}

export namespace MockAppServiceDI {
  export const symbol = Symbol(MockAppService.name)
  export const provider = {
    provide: symbol,
    useClass: MockAppService,
  }
  export type type = MockAppService
}
