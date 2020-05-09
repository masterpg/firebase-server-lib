import { DocumentData, FieldPath, FieldValue, Timestamp } from '@google-cloud/firestore'
import { Dayjs } from 'dayjs'

type AreOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

export type EntityId = { id: string }
export type OmitEntityId<T> = Omit<T, 'id'>
export type OmitEntityDates<T> = Omit<T, 'createdAt' | 'updatedAt'>
export type OmitEntityFields<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>
export type OptionalId<T extends EntityId> = AreOptional<T, 'id'>
type Storable<T> = { [P in keyof T]: P extends 'id' ? T[P] : T[P] | FieldValue } & EntityId
export type StoreDoc<T> = T & EntityId & { createdAt: Timestamp; updatedAt: Timestamp }
export type EntityInput<T> = OmitEntityDates<Storable<T>>
export type EntityOptionalInput<T> = Partial<EntityInput<T>>
export type EncodedObject<T> = Partial<OmitEntityFields<Storable<T>>>
export type DecodedObject<T> = OmitEntityFields<T>
export type EncodeFunc<T, S = DocumentData> = (obj: EntityOptionalInput<T>) => EncodedObject<S>
export type DecodeFunc<T, S = T> = (doc: StoreDoc<S>) => DecodedObject<T>
export type QueryKey<T> = keyof T | FieldPath

export interface Entity {
  id: string
  createdAt: Dayjs
  updatedAt: Dayjs
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
