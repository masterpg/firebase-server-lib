import { CartModule, ProductModule, Store, UserModule } from '@/store/types'
import { CartModuleImpl } from '@/store/modules/cart'
import { Component } from 'vue-property-decorator'
import { ProductModuleImpl } from '@/store/modules/product'
import { UserModuleImpl } from '@/store/modules/auth'
import Vue from 'vue'

@Component
export class StoreImpl extends Vue implements Store {
  readonly product: ProductModule = new ProductModuleImpl()
  readonly cart: CartModule = new CartModuleImpl()
  readonly user: UserModule = new UserModuleImpl()
}

export let store: Store

export function initStore(): void {
  store = new StoreImpl()
}

export * from '@/store/types'
