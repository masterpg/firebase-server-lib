import { Collection, DecodeFunc, EncodeFunc, OmitEntityFields, TimestampEntity } from '../../firestore-ex'
import { StoreNode, StoreService, storageDecode as libStorageDecode, storageEncode as libStorageEncode } from '../../lib'
import { CartItem as _CartItem, Product as _Product } from '../gql.schema'
import { Module } from '@nestjs/common'

//========================================================================
//
//  Interfaces
//
//========================================================================

interface Product extends OmitEntityFields<_Product>, TimestampEntity {}

interface CartItem extends OmitEntityFields<_CartItem>, TimestampEntity {}

//========================================================================
//
//  Collections
//
//========================================================================

//--------------------------------------------------
//  Storage
//--------------------------------------------------

interface AppStoreNode extends StoreNode {}

const storageEncode: EncodeFunc<AppStoreNode> = (obj, operation) => {
  return libStorageEncode(obj, operation)
}

const storageDecode: DecodeFunc<AppStoreNode> = doc => {
  return libStorageDecode(doc)
}

//========================================================================
//
//  Implementation
//
//========================================================================

class AppStoreService extends StoreService {
  constructor() {
    super()

    this.productDao = this.firestoreEx.collection({ path: 'products', useTimestamp: true })
    this.cartDao = this.firestoreEx.collection({ path: 'cart', useTimestamp: true })
    this.m_storageDao = this.firestoreEx.collection({
      path: 'storage-nodes',
      useTimestamp: false,
      encode: storageEncode,
      decode: storageDecode,
    })
  }

  //----------------------------------------------------------------------
  //
  //  Properties
  //
  //----------------------------------------------------------------------

  readonly productDao: Collection<Product>

  readonly cartDao: Collection<CartItem>

  protected m_storageDao: Collection<AppStoreNode>

  get storageDao(): Collection<AppStoreNode> {
    return this.m_storageDao
  }
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
