import { DocumentSnapshot, FieldPath, Query as FirestoreQuery, OrderByDirection, QueryKey, QuerySnapshot, Transaction, WhereFilterOp } from './types'
import { Converter } from './converter'

export class Query<T, S> {
  //----------------------------------------------------------------------
  //
  //  Constructor
  //
  //----------------------------------------------------------------------

  constructor(private readonly _converter: Converter<T, S>, public query: FirestoreQuery) {}

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  where(fieldPath: QueryKey<S>, opStr: WhereFilterOp, value: any): this {
    this.query = this.query.where(fieldPath as string | FieldPath, opStr, value)
    return this
  }

  orderBy(fieldPath: QueryKey<S>, directionStr?: OrderByDirection): this {
    this.query = this.query.orderBy(fieldPath as string | FieldPath, directionStr)
    return this
  }

  limit(limit: number): this {
    this.query = this.query.limit(limit)
    return this
  }

  offset(offset: number): this {
    this.query = this.query.offset(offset)
    return this
  }

  startAt(snap: DocumentSnapshot): Query<T, S>
  startAt(...fieldValues: any[]): Query<T, S>
  startAt(snapOrValue: DocumentSnapshot | unknown, ...fieldValues: unknown[]): this {
    if (!this.query) throw new Error('no query statement before startAt()')

    if (snapOrValue instanceof DocumentSnapshot) {
      this.query = this.query.startAt(snapOrValue)
    } else {
      this.query = this.query.startAt(snapOrValue, ...fieldValues)
    }
    return this
  }

  startAfter(snap: DocumentSnapshot): Query<T, S>
  startAfter(...fieldValues: any[]): Query<T, S>
  startAfter(snapOrValue: DocumentSnapshot | unknown, ...fieldValues: unknown[]): this {
    if (!this.query) throw new Error('no query statement before startAfter()')

    if (snapOrValue instanceof DocumentSnapshot) {
      this.query = this.query.startAfter(snapOrValue)
    } else {
      this.query = this.query.startAfter(snapOrValue, ...fieldValues)
    }
    return this
  }

  endAt(snap: DocumentSnapshot): Query<T, S>
  endAt(...fieldValues: any[]): Query<T, S>
  endAt(snapOrValue: DocumentSnapshot | unknown, ...fieldValues: unknown[]): this {
    if (!this.query) throw new Error('no query statement before endAt()')

    if (snapOrValue instanceof DocumentSnapshot) {
      this.query = this.query.endAt(snapOrValue)
    } else {
      this.query = this.query.endAt(snapOrValue, ...fieldValues)
    }
    return this
  }

  endBefore(snap: DocumentSnapshot): Query<T, S>
  endBefore(...fieldValues: any[]): Query<T, S>
  endBefore(snapOrValue: DocumentSnapshot | unknown, ...fieldValues: unknown[]): this {
    if (!this.query) throw new Error('no query statement before endBefore()')

    if (snapOrValue instanceof DocumentSnapshot) {
      this.query = this.query.endBefore(snapOrValue)
    } else {
      this.query = this.query.endBefore(snapOrValue, ...fieldValues)
    }
    return this
  }

  async fetch(tx?: Transaction): Promise<T[]> {
    if (!this.query) throw new Error('no query statement before fetch()')

    const snap = tx ? await tx.get(this.query) : await this.query.get()
    const arr: T[] = []

    snap.forEach(docSnap => {
      arr.push(this._converter.decode(docSnap))
    })
    return arr
  }

  onSnapshot(callback: (querySnap: QuerySnapshot, toObject: (docSnap: DocumentSnapshot) => T) => void): () => void {
    if (!this.query) throw new Error('no query statement before onSnapshot()')
    return this.query.onSnapshot(_querySnap => {
      callback(_querySnap, this._converter.decode.bind(this._converter))
    })
  }
}
