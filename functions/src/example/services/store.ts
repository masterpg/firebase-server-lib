import { Collection, OmitEntityFields } from '../../firestore-ex'
import { Injectable, Module } from '@nestjs/common'
import { StoreService, TimestampEntity } from '../../lib'
import { CartItem as _CartItem, Product as _Product } from '../gql.schema'

//========================================================================
//
//  Interfaces
//
//========================================================================

interface Product extends OmitEntityFields<_Product>, TimestampEntity {}

interface CartItem extends OmitEntityFields<_CartItem>, TimestampEntity {}

//========================================================================
//
//  Implementation
//
//========================================================================

@Injectable()
class AppStoreService extends StoreService {
  constructor() {
    super()

    this.productDao = this.firestoreEx.collection({ path: 'products', useTimestamp: true })
    this.cartDao = this.firestoreEx.collection({ path: 'cart', useTimestamp: true })
  }

  //----------------------------------------------------------------------
  //
  //  Properties
  //
  //----------------------------------------------------------------------

  readonly productDao: Collection<Product>

  readonly cartDao: Collection<CartItem>
}

namespace AppStoreServiceDI {
  export const symbol = Symbol(AppStoreService.name)
  export const provider = {
    provide: symbol,
    useClass: AppStoreService,
  }
  export type type = AppStoreService
}

@Module({
  providers: [AppStoreServiceDI.provider],
  exports: [AppStoreServiceDI.provider],
})
class AppStoreServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { AppStoreServiceDI, AppStoreServiceModule, CartItem, Product }
