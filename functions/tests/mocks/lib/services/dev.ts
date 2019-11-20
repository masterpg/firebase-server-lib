import { BaseDevUtilsService } from '../../../../src/lib/services'
import { Injectable } from '@nestjs/common'

@Injectable()
class MockDevUtilsService extends BaseDevUtilsService {}

export namespace MockDevUtilsServiceDI {
  export const symbol = Symbol(MockDevUtilsService.name)
  export const provider = {
    provide: symbol,
    useClass: MockDevUtilsService,
  }
  export type type = MockDevUtilsService
}
