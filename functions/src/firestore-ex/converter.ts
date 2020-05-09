import * as dayjs from 'dayjs'
import { DecodeFunc, DocumentSnapshot, EncodeFunc, EncodedObject, FieldValue } from './types'

export class Converter<T, S = T> {
  //----------------------------------------------------------------------
  //
  //  Constructor
  //
  //----------------------------------------------------------------------

  constructor({ encode, decode }: { encode?: EncodeFunc<T, S>; decode?: DecodeFunc<T, S> }) {
    this._encode = encode
    this._decode = decode
  }

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  private _encode?: EncodeFunc<T, S>

  private _decode?: DecodeFunc<T, S>

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
    Object.assign(doc, { updatedAt: FieldValue.serverTimestamp() })

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
    if (!obj.createdAt && doc.createdAt) {
      obj.createdAt = dayjs(doc.createdAt.toDate())
    }
    if (!obj.updatedAt && doc.updatedAt) {
      obj.updatedAt = dayjs(doc.updatedAt.toDate())
    }

    return obj
  }
}
