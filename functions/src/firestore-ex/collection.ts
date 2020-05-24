import {
  CollectionReference,
  DecodeFunc,
  DocumentReference,
  DocumentSnapshot,
  EncodeFunc,
  EntityId,
  EntityInput,
  EntityOptionalInput,
  FieldPath,
  FieldValue,
  OmitEntityId,
  OrderByDirection,
  QueryKey,
  QuerySnapshot,
  TimestampSettings,
  WhereFilterOp,
  WriteResult,
} from './types'
import { Context } from './context'
import { Converter } from './converter'
import { Query } from './query'

export class Collection<T, S = T> {
  //----------------------------------------------------------------------
  //
  //  Constructor
  //
  //----------------------------------------------------------------------

  constructor(params: { context: Context; path: string; encode?: EncodeFunc<T, S>; decode?: DecodeFunc<T, S>; timestamp: TimestampSettings }) {
    this.context = params.context
    this.collectionRef = params.context.db.collection(params.path)
    this._converter = new Converter<T, S>({ encode: params.encode, decode: params.decode, timestamp: params.timestamp })
    this._timestamp = params.timestamp
  }

  //----------------------------------------------------------------------
  //
  //  Properties
  //
  //----------------------------------------------------------------------

  readonly context: Context

  readonly collectionRef: CollectionReference

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  private _converter: Converter<T, S>

  private _timestamp: TimestampSettings

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  toObject(snap: DocumentSnapshot): T {
    return this._converter.decode(snap)
  }

  docRef(id?: string): DocumentReference {
    if (id) return this.collectionRef.doc(id)
    return this.collectionRef.doc()
  }

  async fetch(id: string): Promise<T | undefined> {
    const docRef = this.docRef(id)
    const snap = this.context.tx ? await this.context.tx.get(docRef) : await docRef.get()
    if (!snap.exists) return undefined

    return this.toObject(snap)
  }

  async fetchAll(): Promise<T[]> {
    const snap = this.context.tx ? await this.context.tx.get(this.collectionRef) : await this.collectionRef.get()
    const arr: T[] = []

    snap.forEach(snap => {
      arr.push(this.toObject(snap))
    })
    return arr
  }

  async add(obj: OmitEntityId<EntityInput<T>>): Promise<string> {
    let docRef: DocumentReference
    const doc = this._converter.encode(obj)

    if (this._timestamp.use) {
      ;(doc as any).createdAt = FieldValue.serverTimestamp()
    }

    if (this.context.tx) {
      docRef = this.docRef()
      this.context.tx.set(docRef, doc)
    } else if (this.context.batch) {
      docRef = this.docRef()
      this.context.batch.set(docRef, doc)
    } else {
      docRef = await this.collectionRef.add(doc)
    }
    return docRef.id
  }

  async set(obj: EntityInput<T>): Promise<string> {
    if (!obj.id) throw new Error('Argument object must have "id" property')

    const docRef = this.docRef(obj.id)
    const doc = this._converter.encode(obj)

    if (this._timestamp.use) {
      ;(doc as any).createdAt = FieldValue.serverTimestamp()
    }

    if (this.context.tx) {
      this.context.tx.set(docRef, doc)
    } else if (this.context.batch) {
      this.context.batch.set(docRef, doc)
    } else {
      await docRef.set(doc)
    }
    return obj.id
  }

  async update(obj: EntityOptionalInput<T> & EntityId): Promise<string> {
    if (!obj.id) throw new Error('Argument object must have "id" property')

    const docRef = this.docRef(obj.id)
    const doc = this._converter.encode(obj)

    if (this.context.tx) {
      this.context.tx.update(docRef, doc)
    } else if (this.context.batch) {
      this.context.batch.update(docRef, doc)
    } else {
      await docRef.update(doc)
    }
    return obj.id
  }

  async delete(id: string): Promise<string> {
    const docRef = this.docRef(id)
    if (this.context.tx) {
      this.context.tx.delete(docRef)
    } else if (this.context.batch) {
      this.context.batch.delete(docRef)
    } else {
      await docRef.delete()
    }
    return id
  }

  async bulkAdd(objects: OmitEntityId<EntityInput<T>>[]): Promise<WriteResult[]> {
    return this.context.runBatch(async () => {
      for (const obj of objects) {
        this.add(obj)
      }
    })
  }

  async bulkSet(objects: EntityInput<T>[]): Promise<WriteResult[]> {
    return this.context.runBatch(async () => {
      for (const obj of objects) {
        this.set(obj)
      }
    })
  }

  async bulkDelete(docIds: string[]): Promise<WriteResult[]> {
    return this.context.runBatch(async () => {
      for (const docId of docIds) {
        this.delete(docId)
      }
    })
  }

  where(fieldPath: QueryKey<S>, opStr: WhereFilterOp, value: any): Query<T, S> {
    const query = this.collectionRef.where(fieldPath as string | FieldPath, opStr, value)
    return new Query<T, S>(this._converter, this.context, query)
  }

  orderBy(fieldPath: QueryKey<S>, directionStr?: OrderByDirection): Query<T, S> {
    const query = this.collectionRef.orderBy(fieldPath as string | FieldPath, directionStr)
    return new Query<T, S>(this._converter, this.context, query)
  }

  limit(limit: number): Query<T, S> {
    const query = this.collectionRef.limit(limit)
    return new Query<T, S>(this._converter, this.context, query)
  }

  onSnapshot(callback: (querySnapshot: QuerySnapshot, toObject: (documentSnapshot: DocumentSnapshot) => T) => void): () => void {
    return this.collectionRef.onSnapshot(_querySnapshot => {
      callback(_querySnapshot, this.toObject.bind(this))
    })
  }
}
