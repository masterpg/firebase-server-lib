import * as admin from 'firebase-admin'
import { Collection, CollectionFactory, DecodeFunc, EncodeFunc, FirestoreEx, OmitEntityFields, Query } from '../../firestore-ex'
import { TimestampEntity, firestoreExOptions } from '../../lib/base'
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

interface BaseStore {
  collection: FirestoreEx['collection']
  collectionFactory: FirestoreEx['collectionFactory']
  collectionGroup: FirestoreEx['collectionGroup']
  runTransaction: FirestoreEx['runTransaction']
  runBatch: FirestoreEx['runBatch']
}

class Store implements BaseStore {
  constructor() {
    this._firestoreEx = new FirestoreEx(admin.firestore(), firestoreExOptions)

    this.productDao = this._firestoreEx.collection({ path: 'products', useTimestamp: true })
    this.cartDao = this._firestoreEx.collection({ path: 'cart', useTimestamp: true })
  }

  //----------------------------------------------------------------------
  //
  //  Properties
  //
  //----------------------------------------------------------------------

  readonly productDao: Collection<Product>

  readonly cartDao: Collection<CartItem>

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  private readonly _firestoreEx: FirestoreEx

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  collection<T, S = T>(params: { path: string; encode?: EncodeFunc<T, S>; decode?: DecodeFunc<T, S>; useTimestamp?: boolean }): Collection<T, S> {
    return this._firestoreEx.collection(params)
  }

  collectionFactory<T, S = T>(params: { encode?: EncodeFunc<T, S>; decode?: DecodeFunc<T, S>; useTimestamp?: boolean }): CollectionFactory<T, S> {
    return this._firestoreEx.collectionFactory(params)
  }

  collectionGroup<T, S>(params: { collectionId: string; decode?: DecodeFunc<T, S>; useTimestamp?: boolean }): Query<T, S> {
    return this._firestoreEx.collectionGroup(params)
  }

  runTransaction(updateFunction: (tx: FirebaseFirestore.Transaction) => Promise<void>): Promise<void> {
    return this._firestoreEx.runTransaction(updateFunction)
  }

  runBatch(updateFunction: (batch: FirebaseFirestore.WriteBatch) => Promise<void>): Promise<FirebaseFirestore.WriteResult[]> {
    return this._firestoreEx.runBatch(updateFunction)
  }
}

function store(): Store {
  return new Store()
}

//========================================================================
//
//  Exports
//
//========================================================================

export { store, Product, CartItem }
