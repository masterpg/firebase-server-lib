import { DecodeFunc, EncodeFunc, Firestore } from './types'
import { Collection } from './collection'
import { Context } from './context'
import { Converter } from './converter'
import { Query } from './query'

export class FirestoreEx {
  //----------------------------------------------------------------------
  //
  //  Constructor
  //
  //----------------------------------------------------------------------

  constructor(db: Firestore) {
    this.context = new Context(db)
  }

  //----------------------------------------------------------------------
  //
  //  Properties
  //
  //----------------------------------------------------------------------

  readonly context: Context

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  collection<T, S = T>({ path, encode, decode }: { path: string; encode?: EncodeFunc<T, S>; decode?: DecodeFunc<T, S> }): Collection<T, S> {
    const factory = new CollectionFactory<T, S>({
      context: this.context,
      encode,
      decode,
    })
    return factory.create(path)
  }

  collectionFactory<T, S = T>({ encode, decode }: { encode?: EncodeFunc<T, S>; decode?: DecodeFunc<T, S> }): CollectionFactory<T, S> {
    return new CollectionFactory<T, S>({
      context: this.context,
      encode,
      decode,
    })
  }

  collectionGroup<T, S = T>({ collectionId, decode }: { collectionId: string; decode?: DecodeFunc<T, S> }): Query<T, S> {
    const query = this.context.db.collectionGroup(collectionId)
    const converter = new Converter({ decode })
    return new Query<T, S>(converter, this.context, query)
  }

  async runTransaction(updateFunction: (tx: FirebaseFirestore.Transaction) => Promise<void>): Promise<void> {
    return this.context.runTransaction(updateFunction)
  }

  async runBatch(updateFunction: (batch: FirebaseFirestore.WriteBatch) => Promise<void>): Promise<FirebaseFirestore.WriteResult[]> {
    return this.context.runBatch(updateFunction)
  }
}

class CollectionFactory<T, S = T> {
  //----------------------------------------------------------------------
  //
  //  Constructor
  //
  //----------------------------------------------------------------------

  constructor({ context, encode, decode }: { context: Context; encode?: EncodeFunc<T, S>; decode?: DecodeFunc<T, S> }) {
    this.context = context
    this.encode = encode
    this.decode = decode
  }

  //----------------------------------------------------------------------
  //
  //  Constructor
  //
  //----------------------------------------------------------------------

  readonly context: Context

  readonly encode?: EncodeFunc<T, S>

  readonly decode?: DecodeFunc<T, S>

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  create(path: string): Collection<T, S> {
    return new Collection<T, S>({
      context: this.context,
      path,
      encode: this.encode,
      decode: this.decode,
    })
  }
}
