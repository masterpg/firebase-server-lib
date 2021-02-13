import * as admin from 'firebase-admin'
import { CartItem, Product } from '../base'
import {
  Collection,
  CollectionFactory,
  DecodeFunc,
  EncodeFunc,
  FieldValue,
  FirestoreEx,
  Query,
  Timestamp,
  TimestampEntity,
  Transaction,
  WriteBatch,
} from '../../../firestore-ex'
import { Dayjs } from 'dayjs'
import { Module } from '@nestjs/common'
import dayjs = require('dayjs')
import { firestoreExOptions } from '../../base'

//========================================================================
//
//  Interfaces
//
//========================================================================

interface BaseStore {
  collection: FirestoreEx['collection']
  collectionFactory: FirestoreEx['collectionFactory']
  collectionGroup: FirestoreEx['collectionGroup']
  runTransaction: FirestoreEx['runTransaction']
  runBatch: FirestoreEx['runBatch']
}

//--------------------------------------------------
//  User
//--------------------------------------------------

interface StoreUser extends TimestampEntity {
  fullName: string
}

//========================================================================
//
//  Collections
//
//========================================================================

//========================================================================
//
//  Implementation
//
//========================================================================

class StoreService implements BaseStore {
  constructor() {
    this.firestoreEx = new FirestoreEx(admin.firestore(), firestoreExOptions)

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

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  protected readonly firestoreEx: FirestoreEx

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  collection<T, S = T>(params: { path: string; encode?: EncodeFunc<T, S>; decode?: DecodeFunc<T, S>; useTimestamp?: boolean }): Collection<T, S> {
    return this.firestoreEx.collection(params)
  }

  collectionFactory<T, S = T>(params: { encode?: EncodeFunc<T, S>; decode?: DecodeFunc<T, S>; useTimestamp?: boolean }): CollectionFactory<T, S> {
    return this.firestoreEx.collectionFactory(params)
  }

  collectionGroup<T, S>(params: { collectionId: string; decode?: DecodeFunc<T, S>; useTimestamp?: boolean }): Query<T, S> {
    return this.firestoreEx.collectionGroup(params)
  }

  runTransaction(updateFunction: (tx: Transaction) => Promise<void>): Promise<void> {
    return this.firestoreEx.runTransaction(updateFunction)
  }

  runBatch(updateFunction: (batch: WriteBatch) => Promise<void>): Promise<FirebaseFirestore.WriteResult[]> {
    return this.firestoreEx.runBatch(updateFunction)
  }
}

namespace StoreService {
  /**
   * 指定された日付をストアに格納できる形式に変換します。
   * @param date
   */
  export function toStoreDate(date: Dayjs | FieldValue | undefined | null): Timestamp | FieldValue | undefined {
    if (date instanceof FieldValue) return date
    if (isDate(date)) return Timestamp.fromDate(date.toDate())
    return undefined
  }

  /**
   * 指定された日付が適切な`Dayjs`型の値か判定します。
   * @param date
   */
  export function isDate(date: Dayjs | FieldValue | undefined | null): date is Dayjs {
    // 指定された値がDayjs型の値、かつ有効な値(0でない)場合はtrue
    return dayjs.isDayjs(date) && !date.isSame(dayjs(0))
  }

  /**
   * 指定された日付が空値か判定します。
   * @param date
   */
  export function isEmptyDate(date?: any): date is undefined {
    // 指定された値がundefinedまたはnullの場合、空値と判定
    if (!date) return true
    // 指定された値がDayjs型の値だが、有効な値でない(0)の場合、空値と判定
    return dayjs.isDayjs(date) && date.isSame(dayjs(0))
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

export { StoreService, StoreServiceDI, StoreServiceModule }
