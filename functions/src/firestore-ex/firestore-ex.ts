import { DecodeFunc, EncodeFunc, Firestore, FirestoreExOptions, TimestampSettings, Transaction, WriteBatch, WriteResult } from './types'
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
    this._options = options || {}
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

  readonly _options: FirestoreExOptions

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
      timestamp: this._getTimestampSettings(params.useTimestamp),
    })
    return factory.create(params.path)
  }

  collectionFactory<T, S = T>(params: { encode?: EncodeFunc<T, S>; decode?: DecodeFunc<T, S>; useTimestamp?: boolean }): CollectionFactory<T, S> {
    return new CollectionFactory<T, S>({
      context: this.context,
      encode: params.encode,
      decode: params.decode,
      timestamp: this._getTimestampSettings(params.useTimestamp),
    })
  }

  collectionGroup<T, S = T>(params: { collectionId: string; decode?: DecodeFunc<T, S>; useTimestamp?: boolean }): Query<T, S> {
    const query = this.context.db.collectionGroup(params.collectionId)
    const converter = new Converter({
      decode: params.decode,
      timestamp: this._getTimestampSettings(params.useTimestamp),
    })
    return new Query<T, S>(converter, query)
  }

  async runTransaction(updateFunction: (tx: Transaction) => Promise<void>): Promise<void> {
    return this.context.runTransaction(updateFunction)
  }

  async runBatch(updateFunction: (batch: WriteBatch) => Promise<void>): Promise<WriteResult[]> {
    return this.context.runBatch(updateFunction)
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  private _getTimestampSettings(useTimestamp?: boolean): TimestampSettings | undefined {
    if (useTimestamp && !this._options.timestamp) {
      throw new Error('If you want to use a timestamp, you need to set a timestamp in the constructor.')
    }

    const useTimestampInAll = this._options.timestamp && this._options.timestamp.useInAll
    if (useTimestamp || useTimestampInAll) {
      return {
        toAppDate: this._options.timestamp!.toAppDate,
        toStoreDate: this._options.timestamp!.toStoreDate,
      }
    }

    return
  }
}

export class CollectionFactory<T, S = T> {
  //----------------------------------------------------------------------
  //
  //  Constructor
  //
  //----------------------------------------------------------------------

  constructor(params: { context: Context; encode?: EncodeFunc<T, S>; decode?: DecodeFunc<T, S>; timestamp?: TimestampSettings }) {
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

  readonly timestamp?: TimestampSettings

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
