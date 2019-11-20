import { BaseAppService } from '../../lib/services'
import { Injectable } from '@nestjs/common'

@Injectable()
class AppService extends BaseAppService {}

export namespace AppServiceDI {
  export const symbol = Symbol(AppService.name)
  export const provider = {
    provide: symbol,
    useClass: AppService,
  }
  export type type = AppService
}
