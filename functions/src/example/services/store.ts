import { Collection, DecodeFunc, EncodeFunc, EncodedObject, OmitEntityFields, TimestampEntity } from '../../firestore-ex'
import { StorageNode, StoreService, storageDecode, storageEncode } from '../../lib'
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

interface AppStorageNode extends StorageNode {
  sortOrder?: number
}

const appStorageEncode: EncodeFunc<AppStorageNode> = (obj, operation) => {
  const result: EncodedObject<AppStorageNode> = {
    ...storageEncode(obj, operation),
  }
  if (typeof obj.sortOrder !== 'undefined') {
    result.sortOrder = obj.sortOrder
  }
  return result
}

const appStorageDecode: DecodeFunc<AppStorageNode> = doc => {
  return storageDecode(doc)
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
      encode: appStorageEncode,
      decode: appStorageDecode,
    })
  }

  //----------------------------------------------------------------------
  //
  //  Properties
  //
  //----------------------------------------------------------------------

  readonly productDao: Collection<Product>

  readonly cartDao: Collection<CartItem>

  protected m_storageDao: Collection<AppStorageNode>

  get storageDao(): Collection<AppStorageNode> {
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

export { AppStoreServiceDI, AppStoreServiceModule }
export { AppStorageNode, CartItem, Product }
