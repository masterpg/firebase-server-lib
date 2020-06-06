import * as admin from 'firebase-admin'
import {
  Collection,
  CollectionFactory,
  DecodeFunc,
  EncodeFunc,
  EncodedObject,
  FirestoreEx,
  Query,
  TimestampEntity,
  Transaction,
  WriteBatch,
} from '../../firestore-ex'
import { Injectable, Module } from '@nestjs/common'
import { firestoreExOptions } from '../base'

//========================================================================
//
//  Interfaces
//
//========================================================================

interface StoreUser extends TimestampEntity {
  fullName: string
}

interface PublicProfile extends TimestampEntity {
  displayName: string
  photoURL?: string
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
  }

  //----------------------------------------------------------------------
  //
  //  Properties
  //
  //----------------------------------------------------------------------

  readonly userDao: Collection<StoreUser>

  readonly publicProfileDao: Collection<PublicProfile>

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

export { StoreService, StoreServiceDI, StoreServiceModule, PublicProfile, StoreUser }
