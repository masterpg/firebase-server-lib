import { AuthLogic, Logic, ShopLogic, StorageLogic } from '@/logic/types'
import { StorageLogicImpl, StorageUploadManager } from '@/logic/modules/storage'
import { AuthLogicImpl } from '@/logic/modules/auth'
import { ShopLogicImpl } from '@/logic/modules/shop'
import Vue from 'vue'

class LogicImpl implements Logic {
  readonly storage: StorageLogic = new StorageLogicImpl()
  readonly shop: ShopLogic = new ShopLogicImpl()
  readonly auth: AuthLogic = new AuthLogicImpl()
}

export let logic: Logic

export function initLogic(): void {
  logic = new LogicImpl()
  Object.defineProperty(Vue.prototype, '$logic', {
    value: logic,
    writable: false,
    configurable: true,
  })
}

export * from '@/logic/types'
export { StorageUploadManager }
