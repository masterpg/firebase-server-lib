import { Collection, DecodeFunc, EncodeFunc, EncodedObject, OmitEntityFields, TimestampEntity } from '../../firestore-ex'
import { CartItem as _CartItem, Product as _Product } from '../gql.schema'
import {
  StorageNode as _StorageNode,
  StoreService as _StoreService,
  storageDecode as _storageDecode,
  storageEncode as _storageEncode,
} from '../../lib'
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

enum StorageDocBundleType {
  List = 'List',
  Category = 'Category',
}

interface StorageNode extends _StorageNode {
  docBundleType?: StorageDocBundleType
  isDoc?: boolean
  docSortOrder?: number
}

const storageEncode: EncodeFunc<StorageNode> = (obj, operation) => {
  const result: EncodedObject<StorageNode> = {
    ..._storageEncode(obj, operation),
  }
  if (typeof obj.docBundleType === 'string') {
    result.docBundleType = obj.docBundleType
  }
  if (typeof obj.isDoc === 'boolean') {
    result.isDoc = obj.isDoc
  }
  if (typeof obj.docSortOrder === 'number') {
    result.docSortOrder = obj.docSortOrder
  }
  return result
}

const storageDecode: DecodeFunc<StorageNode> = doc => {
  return _storageDecode(doc)
}

//========================================================================
//
//  Implementation
//
//========================================================================

class StoreService extends _StoreService {
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

  protected m_storageDao: Collection<StorageNode>

  get storageDao(): Collection<StorageNode> {
    return this.m_storageDao
  }
}

namespace StoreServiceDI {
  export const symbol = Symbol(StoreService.name)
  export const provider = {
    provide: symbol,
    useClass: StoreService,
  }
  export type type = StoreService
}

@Module({
  providers: [StoreServiceDI.provider],
  exports: [StoreServiceDI.provider],
})
class StoreServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { StoreServiceDI, StoreServiceModule }
export { StorageNode, StorageDocBundleType, CartItem, Product }
