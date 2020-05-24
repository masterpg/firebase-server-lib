import { DecodeFunc, EncodeFunc, Firestore, FirestoreExOptions, TimestampSettings } from './types'
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

  constructor(db: Firestore, options?: FirestoreExOptions) {
    this.context = new Context(db)

    this._options = { useTimestampInAll: false, timestampToDate: options => options.toDate() }
    if (options) {
      this._options.useTimestampInAll = options.useTimestampInAll ?? this._options.useTimestampInAll
      this._options.timestampToDate = options.timestampToDate ?? this._options.timestampToDate
    }
  }

  //----------------------------------------------------------------------
  //
  //  Properties
  //
  //----------------------------------------------------------------------

  readonly context: Context

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  readonly _options: Required<FirestoreExOptions>

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  collection<T, S = T>(params: { path: string; encode?: EncodeFunc<T, S>; decode?: DecodeFunc<T, S>; useTimestamp?: boolean }): Collection<T, S> {
    const factory = new CollectionFactory<T, S>({
      context: this.context,
      encode: params.encode,
      decode: params.decode,
      timestamp: {
        use: this._options.useTimestampInAll || Boolean(params.useTimestamp),
        toDate: this._options.timestampToDate,
      },
    })
    return factory.create(params.path)
  }

  collectionFactory<T, S = T>(params: { encode?: EncodeFunc<T, S>; decode?: DecodeFunc<T, S>; useTimestamp?: boolean }): CollectionFactory<T, S> {
    return new CollectionFactory<T, S>({
      context: this.context,
      encode: params.encode,
      decode: params.decode,
      timestamp: {
        use: this._options.useTimestampInAll || Boolean(params.useTimestamp),
        toDate: this._options.timestampToDate,
      },
    })
  }

  collectionGroup<T, S = T>(params: { collectionId: string; decode?: DecodeFunc<T, S>; useTimestamp?: boolean }): Query<T, S> {
    const query = this.context.db.collectionGroup(params.collectionId)
    const converter = new Converter({
      decode: params.decode,
      timestamp: {
        use: this._options.useTimestampInAll || Boolean(params.useTimestamp),
        toDate: this._options.timestampToDate,
      },
    })
    return new Query<T, S>(converter, this.context, query)
  }

  async runTransaction(updateFunction: (tx: FirebaseFirestore.Transaction) => Promise<void>): Promise<void> {
    return this.context.runTransaction(updateFunction)
  }

  async runBatch(updateFunction: (batch: FirebaseFirestore.WriteBatch) => Promise<void>): Promise<FirebaseFirestore.WriteResult[]> {
    return this.context.runBatch(updateFunction)
  }
}

export class CollectionFactory<T, S = T> {
  //----------------------------------------------------------------------
  //
  //  Constructor
  //
  //----------------------------------------------------------------------

  constructor(params: { context: Context; encode?: EncodeFunc<T, S>; decode?: DecodeFunc<T, S>; timestamp: TimestampSettings }) {
    this.context = params.context
    this.encode = params.encode
    this.decode = params.decode
    this.timestamp = params.timestamp
  }

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  readonly context: Context

  readonly encode?: EncodeFunc<T, S>

  readonly decode?: DecodeFunc<T, S>

  readonly timestamp: TimestampSettings

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
      timestamp: this.timestamp,
    })
  }
}
