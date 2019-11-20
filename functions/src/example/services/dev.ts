import { BaseDevUtilsService } from '../../lib/services'
import { Injectable } from '@nestjs/common'

@Injectable()
class DevUtilsService extends BaseDevUtilsService {}

export namespace DevUtilsServiceDI {
  export const symbol = Symbol(DevUtilsService.name)
  export const provider = {
    provide: symbol,
    useClass: DevUtilsService,
  }
  export type type = DevUtilsService
}
