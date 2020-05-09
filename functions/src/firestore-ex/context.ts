import { Firestore, Transaction, WriteBatch, WriteResult } from './types'

export class Context {
  //----------------------------------------------------------------------
  //
  //  Constructor
  //
  //----------------------------------------------------------------------

  constructor(readonly db: Firestore) {}

  //----------------------------------------------------------------------
  //
  //  Properties
  //
  //----------------------------------------------------------------------

  private _tx?: Transaction = undefined

  get tx(): Transaction | undefined {
    return this._tx
  }

  private _batch?: WriteBatch = undefined

  get batch(): WriteBatch | undefined {
    return this._batch
  }

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  async runTransaction(updateFunction: (tx: Transaction) => Promise<void>): Promise<void> {
    if (this._tx || this._batch) throw new Error('Disallow nesting transaction or batch')

    await this.db.runTransaction(async tx => {
      this._tx = tx
      await updateFunction(tx)
    })
    this._tx = undefined
  }

  async runBatch(updateFunction: (batch: WriteBatch) => Promise<void>): Promise<WriteResult[]> {
    if (this._tx || this._batch) throw new Error('Disallow nesting transaction or batch')

    this._batch = this.db.batch()

    await updateFunction(this._batch)
    const writeResults = await this._batch.commit()

    this._batch = undefined
    return writeResults
  }
}