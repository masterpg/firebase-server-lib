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

    try {
      await this.db.runTransaction(async tx => {
        this._tx = tx
        await updateFunction(tx)
      })
    } catch (err) {
      this._tx = undefined
      throw err
    }
    this._tx = undefined
  }

  async runBatch(updateFunction: (batch: WriteBatch) => Promise<void>): Promise<WriteResult[]> {
    if (this._tx || this._batch) throw new Error('Disallow nesting transaction or batch')

    this._batch = this.db.batch()

    let writeResults: WriteResult[] = []

    try {
      await updateFunction(this._batch)
      writeResults = await this._batch.commit()
    } catch (err) {
      this._batch = undefined
      throw err
    }

    this._batch = undefined
    return writeResults
  }
}
