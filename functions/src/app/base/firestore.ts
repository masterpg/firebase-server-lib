import { FieldValue, FirestoreExOptions } from '../../firestore-ex'

//========================================================================
//
//  Implementation
//
//========================================================================

const firestoreExOptions: FirestoreExOptions = {}

/**
 * Firestoreのトランザクションで複数の処理を並列実行する際、
 * 各処理の書き込み処理の準備が整うまで待機するのを制御するためのオブザーバーです。
 */
class WriteReadyObserver {
  constructor(private m_num: number) {}

  private m_promise?: Promise<void>

  private m_resolve?: () => void

  wait(): Promise<void> {
    if (!this.m_promise) {
      this.m_promise = new Promise<void>(resolve => {
        this.m_resolve = resolve
      })
    }
    this.m_decrement()
    return this.m_promise
  }

  clear(): void {
    this.m_resolve && this.m_resolve()
    this.m_resolve = undefined
  }

  private m_decrement(): void {
    this.m_num--
    if (this.m_num === 0) {
      this.clear()
    }
  }
}

/**
 * 指定されたオブジェクトが`FieldValue`型か否かを取得します。
 * @param obj
 */
function isFieldValue(obj: any): boolean {
  return obj instanceof FieldValue
}

//========================================================================
//
//  Exports
//
//========================================================================

export { WriteReadyObserver, firestoreExOptions, isFieldValue }
