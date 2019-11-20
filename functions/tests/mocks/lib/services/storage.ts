import { BaseStorageService } from '../../../../src/lib/services'
import { Injectable } from '@nestjs/common'

@Injectable()
class MockStorageService extends BaseStorageService {}

export namespace MockStorageServiceDI {
  export const symbol = Symbol(MockStorageService.name)
  export const provider = {
    provide: symbol,
    useClass: MockStorageService,
  }
  export type type = MockStorageService
}
