import Vue from 'vue'
import {Logic, ShopLogic} from '@/logic/types'
import {ShopLogicImpl} from '@/logic/shop'

class LogicImpl implements Logic {
  readonly shop: ShopLogic = new ShopLogicImpl()
}

export let logic: Logic

export function initLogic(): void {
  logic = new LogicImpl()
  Object.defineProperty(Vue.prototype, '$logic', {
    value: logic,
    writable: false,
  })
}

export * from '@/logic/types'
