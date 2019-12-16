import { BaseAppService } from '../../../../src/lib'
import { Injectable } from '@nestjs/common'

@Injectable()
class MockAppService extends BaseAppService {}

export namespace MockAppServiceDI {
  export const symbol = Symbol(MockAppService.name)
  export const provider = {
    provide: symbol,
    useClass: MockAppService,
  }
  export type type = MockAppService
}
