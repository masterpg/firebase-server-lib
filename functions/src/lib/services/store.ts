import * as admin from 'firebase-admin'
import {
  Collection,
  CollectionFactory,
  DecodeFunc,
  DecodedObject,
  EncodeFunc,
  EncodedObject,
  FieldValue,
  FirestoreEx,
  Query,
  Timestamp,
  TimestampEntity,
  Transaction,
  WriteBatch,
} from '../../firestore-ex'
import { Injectable, Module } from '@nestjs/common'
import { Dayjs } from 'dayjs'
import { firestoreExOptions } from '../base'
import dayjs = require('dayjs')

//========================================================================
//
//  Interfaces
//
//========================================================================

//--------------------------------------------------
//  User
//--------------------------------------------------

interface StoreUser extends TimestampEntity {
  fullName: string
}

interface PublicProfile extends TimestampEntity {
  displayName: string
  photoURL?: string
}

//--------------------------------------------------
//  Storage
//--------------------------------------------------

enum StorageNodeType {
  File = 'File',
  Dir = 'Dir',
}

interface StorageNodeShareSettings {
  isPublic: boolean | null
  readUIds: string[] | null
  writeUIds: string[] | null
}

interface StoreNode extends TimestampEntity {
  nodeType: StorageNodeType
  name: string
  dir: string
  path: string
  level: number
  contentType: string
  size: number
  share: StorageNodeShareSettings
  version: number
}

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

@Injectable()
class StoreService implements BaseStore {
  constructor() {
    this.firestoreEx = new FirestoreEx(admin.firestore(), firestoreExOptions)

    this.userDao = this.firestoreEx.collection({
      path: 'users',
      useTimestamp: true,
      encode: obj => {
        const result: EncodedObject<StoreUser> = {}
        if (obj.fullName) result.fullName = obj.fullName
        return result
      },
    })

    this.publicProfileDao = this.firestoreEx.collection({
      path: 'public-profiles',
      useTimestamp: true,
      encode: obj => {
        const result: EncodedObject<PublicProfile> = {}
        if (obj.displayName) result.displayName = obj.displayName
        if (obj.photoURL) result.photoURL = obj.photoURL
        return result
      },
    })

    this.storageDao = this.firestoreEx.collection({
      path: 'storage-nodes',
      useTimestamp: false,
      encode: (obj, operation) => {
        const result: EncodedObject<StoreNode> = {}

        if (typeof obj.nodeType === 'string') result.nodeType = obj.nodeType
        if (typeof obj.name === 'string') result.name = obj.name
        if (typeof obj.dir === 'string') result.dir = obj.dir
        if (typeof obj.path === 'string') result.path = obj.path
        if (typeof obj.level === 'number') result.level = obj.level
        if (typeof obj.contentType === 'string') result.contentType = obj.contentType
        if (typeof obj.size === 'number') result.size = obj.size
        if (obj.share) result.share = obj.share
        result.version = obj.version

        const createdAt = this.toStoreDate(obj.createdAt)
        if (createdAt) result.createdAt = createdAt
        const updatedAt = this.toStoreDate(obj.updatedAt)
        if (updatedAt) result.updatedAt = updatedAt

        return result
      },
      decode: doc => {
        const { createdAt, updatedAt, ...body } = doc
        const result: DecodedObject<StoreNode> = { ...body }
        if (createdAt) result.createdAt = dayjs(createdAt.toDate())
        if (updatedAt) result.updatedAt = dayjs(updatedAt.toDate())
        return result
      },
    })
  }

  //----------------------------------------------------------------------
  //
  //  Properties
  //
  //----------------------------------------------------------------------

  readonly userDao: Collection<StoreUser>

  readonly publicProfileDao: Collection<PublicProfile>

  readonly storageDao: Collection<StoreNode>

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

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  /**
   * 指定された日付をストアに格納できる形式に変換します。
   * @param date
   */
  protected toStoreDate(date: Dayjs | FieldValue | undefined | null): Timestamp | FieldValue | undefined {
    if (date instanceof FieldValue) return date
    if (this.isDate(date)) return Timestamp.fromDate(date.toDate())
    return undefined
  }

  /**
   * 指定された日付が適切な`Dayjs`型の値か判定します。
   * @param date
   */
  protected isDate(date: Dayjs | FieldValue | undefined | null): date is Dayjs {
    // 指定された値がDayjs型の値、かつ有効な値(0でない)場合はtrue
    return dayjs.isDayjs(date) && !date.isSame(dayjs(0))
  }

  /**
   * 指定された日付が空値か判定します。
   * @param date
   */
  protected isEmptyDate(date?: any): date is undefined {
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

export { PublicProfile, StorageNodeShareSettings, StorageNodeType, StoreService, StoreServiceDI, StoreServiceModule, StoreNode, StoreUser }
