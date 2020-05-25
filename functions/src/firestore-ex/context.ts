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
  //  Methods
  //
  //----------------------------------------------------------------------

  async runTransaction(updateFunction: (tx: Transaction) => Promise<void>): Promise<void> {
    await this.db.runTransaction(async tx => {
      await updateFunction(tx)
    })
  }

  async runBatch(updateFunction: (batch: WriteBatch) => Promise<void>): Promise<WriteResult[]> {
    let writeResults: WriteResult[] = []

    const batch = this.db.batch()
    await updateFunction(batch)
    writeResults = await batch.commit()

    return writeResults
  }
}
