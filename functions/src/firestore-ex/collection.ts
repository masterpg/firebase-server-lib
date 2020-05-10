import {
  CollectionReference,
  DecodeFunc,
  DocumentReference,
  DocumentSnapshot,
  EncodeFunc,
  EntityId,
  EntityInput,
  EntityOptionalInput,
  FieldValue,
  OmitEntityId,
  QueryKey,
  QuerySnapshot,
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

  constructor({ context, path, encode, decode }: { context: Context; path: string; encode?: EncodeFunc<T, S>; decode?: DecodeFunc<T, S> }) {
    this.context = context
    this.collectionRef = context.db.collection(path)
    this._converter = new Converter<T, S>({ encode, decode })
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

    ;(doc as any).createdAt = FieldValue.serverTimestamp()

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

    ;(doc as any).createdAt = FieldValue.serverTimestamp()

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

  async bulkAdd(objects: OmitEntityId<EntityInput<T>>[]): Promise<FirebaseFirestore.WriteResult[]> {
    return this.context.runBatch(async () => {
      for (const obj of objects) {
        this.add(obj)
      }
    })
  }

  async bulkSet(objects: EntityInput<T>[]): Promise<FirebaseFirestore.WriteResult[]> {
    return this.context.runBatch(async () => {
      for (const obj of objects) {
        this.set(obj)
      }
    })
  }

  async bulkDelete(docIds: string[]): Promise<FirebaseFirestore.WriteResult[]> {
    return this.context.runBatch(async () => {
      for (const docId of docIds) {
        this.delete(docId)
      }
    })
  }

  where(fieldPath: QueryKey<S>, opStr: FirebaseFirestore.WhereFilterOp, value: any): Query<T, S> {
    const query = this.collectionRef.where(fieldPath as string | FirebaseFirestore.FieldPath, opStr, value)
    return new Query<T, S>(this._converter, this.context, query)
  }

  orderBy(fieldPath: QueryKey<S>, directionStr?: FirebaseFirestore.OrderByDirection): Query<T, S> {
    const query = this.collectionRef.orderBy(fieldPath as string | FirebaseFirestore.FieldPath, directionStr)
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
