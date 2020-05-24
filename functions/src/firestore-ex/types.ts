import { DocumentData, FieldPath, FieldValue, Timestamp } from '@google-cloud/firestore'
import { Dayjs } from 'dayjs'

type AreOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

export type EntityId = { id: string }
export type OmitEntityId<T> = Omit<T, 'id'>
export type OmitEntityTimestamp<T> = Omit<T, 'createdAt' | 'updatedAt'>
export type OmitEntityFields<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>
export type OptionalId<T extends EntityId> = AreOptional<T, 'id'>
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

export {
  CollectionReference,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  FieldPath,
  FieldValue,
  Firestore,
  OrderByDirection,
  Query,
  QuerySnapshot,
  Transaction,
  WhereFilterOp,
  WriteBatch,
  WriteResult,
} from '@google-cloud/firestore'
