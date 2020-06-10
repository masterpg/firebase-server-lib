import { DecodeFunc, DocumentSnapshot, EncodeFunc, EncodedObject, FieldValue, Timestamp, WriteOperationType } from './types'
import dayjs = require('dayjs')

export class Converter<T, S = T> {
  //----------------------------------------------------------------------
  //
  //  Constructor
  //
  //----------------------------------------------------------------------

  constructor(params: { encode?: EncodeFunc<T, S>; decode?: DecodeFunc<T, S>; useTimestamp?: boolean }) {
    this._encode = params.encode
    this._decode = params.decode
    this._useTimestamp = Boolean(params.useTimestamp)
  }

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  private _encode?: EncodeFunc<T, S>

  private _decode?: DecodeFunc<T, S>

  private _useTimestamp: boolean

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  encode(obj: any, operation: WriteOperationType): EncodedObject<S> {
    const doc: EncodedObject<S> = {}
    if (this._encode) {
      Object.assign(doc, this._encode(obj, operation))
    } else {
      Object.assign(doc, obj)
    }

    if ('id' in doc) delete (doc as any).id

    if (this._useTimestamp) {
      if ('createdAt' in doc) delete (doc as any).createdAt

      switch (operation) {
        case 'add': {
          Object.assign(doc, { createdAt: FieldValue.serverTimestamp() })
          break
        }
        case 'set': {
          const createdAt = (obj as any).createdAt
          if (dayjs.isDayjs(createdAt)) {
            Object.assign(doc, { createdAt: Timestamp.fromDate(createdAt.toDate()) })
          } else {
            Object.assign(doc, { createdAt: FieldValue.serverTimestamp() })
          }
          break
        }
      }

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
    if (this._useTimestamp) {
      if (!obj.createdAt && doc.createdAt) {
        obj.createdAt = dayjs(doc.createdAt.toDate())
      }
      if (!obj.updatedAt && doc.updatedAt) {
        obj.updatedAt = dayjs(doc.updatedAt.toDate())
      }
    }

    return obj
  }
}
