import * as firestore from '@google-cloud/firestore'
import { Dayjs } from 'dayjs'
import FieldValue = firestore.FieldValue
import Timestamp = firestore.Timestamp
import DocumentData = firestore.DocumentData
import FieldPath = firestore.FieldPath

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends null
    ? null
    : T[K] extends undefined
    ? undefined
    : T[K] extends Dayjs
    ? Dayjs | FieldValue
    : T[K] extends FieldValue
    ? FieldValue
    : T[K] extends Array<infer R>
    ? Array<DeepPartial<R>>
    : DeepPartial<T[K]>
}

type Storable<T> = {
  [K in keyof T]: T[K] extends null
    ? null
    : T[K] extends undefined
    ? undefined
    : T[K] extends Dayjs
    ? Dayjs | FieldValue
    : T[K] extends FieldValue
    ? FieldValue
    : T[K] extends Array<infer R>
    ? Array<Storable<R>> | FieldValue
    : T[K] extends object
    ? Storable<T[K]>
    : T[K] | FieldValue
}

type PartialStorable<T> = {
  [K in keyof T]?: T[K] extends null
    ? null
    : T[K] extends undefined
    ? undefined
    : T[K] extends Dayjs
    ? Dayjs | FieldValue
    : T[K] extends FieldValue
    ? FieldValue
    : T[K] extends Array<infer R>
    ? Array<PartialStorable<R>> | FieldValue
    : T[K] extends object
    ? PartialStorable<T[K]>
    : T[K] | FieldValue
}

export type EntityId = { id: string }
type AppTimestamp = { createdAt: Dayjs; updatedAt: Dayjs }
type StoreTimestamp = { createdAt: Timestamp; updatedAt: Timestamp }
export type OmitEntityId<T> = Omit<T, 'id'>
export type OmitEntityTimestamp<T> = Omit<T, 'createdAt' | 'updatedAt'>
export type OmitEntityFields<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>
type StoreDoc<T> = T & EntityId & Partial<StoreTimestamp>
export type EntityAddInput<T> = Storable<OmitEntityFields<T> & Partial<AppTimestamp>>
export type EntitySetInput<T> = Storable<OmitEntityFields<T> & Partial<AppTimestamp>> & EntityId
export type EntityUpdateInput<T> = PartialStorable<OmitEntityFields<T> & AppTimestamp> & EntityId
export type EncodedObject<T> = PartialStorable<OmitEntityFields<T> & StoreTimestamp>
export type DecodedObject<T> = OmitEntityFields<T> & Partial<EntityId & AppTimestamp>
export type EncodeFunc<T, S = DocumentData> = (obj: EntityUpdateInput<T>) => EncodedObject<S>
export type DecodeFunc<T, S = T> = (doc: StoreDoc<S>) => DecodedObject<T>
export type QueryKey<T> = keyof T | FieldPath
export type AtomicOperation = Transaction | WriteBatch

export interface FirestoreExOptions {
  useTimestampInAll?: boolean
}

export type Entity = EntityId
export type TimestampEntity = EntityId & AppTimestamp

export import CollectionReference = firestore.CollectionReference
export import DocumentData = firestore.DocumentData
export import DocumentReference = firestore.DocumentReference
export import DocumentSnapshot = firestore.DocumentSnapshot
export import FieldPath = firestore.FieldPath
export import FieldValue = firestore.FieldValue
export import Firestore = firestore.Firestore
export import OrderByDirection = firestore.OrderByDirection
export import Query = firestore.Query
export import QuerySnapshot = firestore.QuerySnapshot
export import Timestamp = firestore.Timestamp
export import Transaction = firestore.Transaction
export import WhereFilterOp = firestore.WhereFilterOp
export import WriteBatch = firestore.WriteBatch
export import WriteResult = firestore.WriteResult
