import {
  AtomicOperation,
  CollectionReference,
  DecodeFunc,
  DocumentReference,
  DocumentSnapshot,
  EncodeFunc,
  EntityAddInput,
  EntitySetInput,
  EntityUpdateInput,
  FieldPath,
  OrderByDirection,
  QueryKey,
  QuerySnapshot,
  Transaction,
  WhereFilterOp,
  WriteBatch,
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

  constructor(params: { context: Context; path: string; encode?: EncodeFunc<T, S>; decode?: DecodeFunc<T, S>; useTimestamp?: boolean }) {
    this.context = params.context
    this.collectionRef = params.context.db.collection(params.path)
    this._converter = new Converter<T, S>({ encode: params.encode, decode: params.decode, useTimestamp: params.useTimestamp })
    this._useTimestamp = Boolean(params.useTimestamp)
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

  private _useTimestamp: boolean

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

  async fetch(id: string, tx?: Transaction): Promise<T | undefined> {
    const docRef = this.docRef(id)
    const snap = tx ? await tx.get(docRef) : await docRef.get()
    if (!snap.exists) return undefined

    return this.toObject(snap)
  }

  async fetchAll(tx?: Transaction): Promise<T[]> {
    const snap = tx ? await tx.get(this.collectionRef) : await this.collectionRef.get()
    const arr: T[] = []

    snap.forEach(snap => {
      arr.push(this.toObject(snap))
    })
    return arr
  }

  async add(obj: EntityAddInput<T>, atomic?: AtomicOperation): Promise<string> {
    let docRef: DocumentReference
    const doc = this._converter.encode(obj, 'add')

    if (atomic instanceof Transaction) {
      docRef = this.docRef()
      atomic.set(docRef, doc)
    } else if (atomic instanceof WriteBatch) {
      docRef = this.docRef()
      atomic.set(docRef, doc)
    } else {
      docRef = await this.collectionRef.add(doc)
    }
    return docRef.id
  }

  async set(obj: EntitySetInput<T>, atomic?: AtomicOperation): Promise<string> {
    if (!obj.id) throw new Error('Argument object must have "id" property')

    const docRef = this.docRef(obj.id)
    const doc = this._converter.encode(obj, 'set')

    if (atomic instanceof Transaction) {
      atomic.set(docRef, doc)
    } else if (atomic instanceof WriteBatch) {
      atomic.set(docRef, doc)
    } else {
      await docRef.set(doc)
    }
    return obj.id
  }

  async update(obj: EntityUpdateInput<T>, atomic?: AtomicOperation): Promise<string> {
    if (!obj.id) throw new Error('Argument object must have "id" property')

    const docRef = this.docRef(obj.id)
    const doc = this._converter.encode(obj, 'update')

    if (atomic instanceof Transaction) {
      atomic.update(docRef, doc)
    } else if (atomic instanceof WriteBatch) {
      atomic.update(docRef, doc)
    } else {
      await docRef.update(doc)
    }
    return obj.id
  }

  async delete(id: string, atomic?: AtomicOperation): Promise<string> {
    const docRef = this.docRef(id)
    if (atomic instanceof Transaction) {
      atomic.delete(docRef)
    } else if (atomic instanceof WriteBatch) {
      atomic.delete(docRef)
    } else {
      await docRef.delete()
    }
    return id
  }

  async bulkAdd(objects: EntityAddInput<T>[]): Promise<WriteResult[]> {
    return this.context.runBatch(async batch => {
      await Promise.all(objects.map(obj => this.add(obj, batch)))
    })
  }

  async bulkSet(objects: EntitySetInput<T>[]): Promise<WriteResult[]> {
    return this.context.runBatch(async batch => {
      await Promise.all(objects.map(obj => this.set(obj, batch)))
    })
  }

  async bulkDelete(docIds: string[]): Promise<WriteResult[]> {
    return this.context.runBatch(async batch => {
      await Promise.all(docIds.map(docId => this.delete(docId, batch)))
    })
  }

  where(fieldPath: QueryKey<S>, opStr: WhereFilterOp, value: any): Query<T, S> {
    const query = this.collectionRef.where(fieldPath as string | FieldPath, opStr, value)
    return new Query<T, S>(this._converter, query)
  }

  orderBy(fieldPath: QueryKey<S>, directionStr?: OrderByDirection): Query<T, S> {
    const query = this.collectionRef.orderBy(fieldPath as string | FieldPath, directionStr)
    return new Query<T, S>(this._converter, query)
  }

  limit(limit: number): Query<T, S> {
    const query = this.collectionRef.limit(limit)
    return new Query<T, S>(this._converter, query)
  }

  onSnapshot(callback: (querySnapshot: QuerySnapshot, toObject: (documentSnapshot: DocumentSnapshot) => T) => void): () => void {
    return this.collectionRef.onSnapshot(_querySnapshot => {
      callback(_querySnapshot, this.toObject.bind(this))
    })
  }
}
