import * as firestore from '@google-cloud/firestore'
import FieldValue = firestore.FieldValue
import Timestamp = firestore.Timestamp
import DocumentData = firestore.DocumentData
import FieldPath = firestore.FieldPath

export type EntityId = { id: string }
export type OmitEntityId<T> = Omit<T, 'id'>
export type OmitEntityTimestamp<T> = Omit<T, 'createdAt' | 'updatedAt'>
export type OmitEntityFields<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>
type Storable<T> = { [P in keyof T]: P extends 'id' ? T[P] : T[P] | FieldValue } & EntityId
export type StoreDoc<T> = T & EntityId & { createdAt: Timestamp; updatedAt: Timestamp }
export type EntityInput<T> = OmitEntityTimestamp<Storable<T>>
export type EntityOptionalInput<T> = Partial<EntityInput<T>>
export type EncodedObject<T> = Partial<OmitEntityFields<Storable<T>>>
export type DecodedObject<T> = OmitEntityFields<T>
export type EncodeFunc<T, S = DocumentData> = (obj: EntityOptionalInput<T>) => EncodedObject<S>
export type DecodeFunc<T, S = T> = (doc: StoreDoc<S>) => DecodedObject<T>
export type QueryKey<T> = keyof T | FieldPath

export type TimeStampToDate = (timestamp: Timestamp) => any

export interface FirestoreExOptions {
  useTimestampInAll?: boolean
  timestampToDate?: TimeStampToDate
}

export interface TimestampSettings {
  use: boolean
  toDate: TimeStampToDate
}

export interface Entity {
  id: string
}

export interface TimestampEntity<D = Date> {
  id: string
  createdAt: D
  updatedAt: D
}

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
