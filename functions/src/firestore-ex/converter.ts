import { DecodeFunc, DocumentSnapshot, EncodeFunc, EncodedObject, FieldValue, TimestampSettings } from './types'

export class Converter<T, S = T> {
  //----------------------------------------------------------------------
  //
  //  Constructor
  //
  //----------------------------------------------------------------------

  constructor(params: { encode?: EncodeFunc<T, S>; decode?: DecodeFunc<T, S>; timestamp: TimestampSettings }) {
    this._encode = params.encode
    this._decode = params.decode
    this._timestamp = params.timestamp
  }

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  private _encode?: EncodeFunc<T, S>

  private _decode?: DecodeFunc<T, S>

  private _timestamp: TimestampSettings

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  encode(obj: any): EncodedObject<S> {
    const doc: EncodedObject<S> = {}
    if (this._encode) {
      Object.assign(doc, this._encode(obj))
    } else {
      Object.assign(doc, obj)
    }

    if ('id' in doc) delete (doc as any).id

    if (this._timestamp.use) {
      if ('createdAt' in doc) delete (doc as any).createdAt
      Object.assign(doc, { updatedAt: FieldValue.serverTimestamp() })
    }

    return doc
  }

  decode(snap: DocumentSnapshot): T {
    const doc: any = { id: snap.id, ...snap.data() }
    const obj: any = {}

    if (this._decode) {
      Object.assign(obj, this._decode({ ...doc }))
    } else {
      const { id, createdAt, updatedAt, ...withoutDoc } = doc
      Object.assign(obj, withoutDoc)
    }

    if (!obj.id) {
      obj.id = doc.id
    }
    if (this._timestamp.use) {
      if (!obj.createdAt && doc.createdAt) {
        obj.createdAt = this._timestamp.toDate(doc.createdAt)
      }
      if (!obj.updatedAt && doc.updatedAt) {
        obj.updatedAt = this._timestamp.toDate(doc.updatedAt)
      }
    }

    return obj
  }
}
