import { FirestoreExOptions, Timestamp, TimestampEntity as _TimestampEntity } from '../../firestore-ex'
import { Dayjs } from 'dayjs'
import dayjs = require('dayjs')

//========================================================================
//
//  Interfaces
//
//========================================================================

interface TimestampEntity extends _TimestampEntity<Dayjs> {}

//========================================================================
//
//  Implementation
//
//========================================================================

const firestoreExOptions: FirestoreExOptions = {
  timestamp: {
    toAppDate: timestamp => dayjs(timestamp.toDate()),
    toStoreDate: (date: Dayjs) => Timestamp.fromDate(date.toDate()),
  },
}

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

//========================================================================
//
//  Exports
//
//========================================================================

export { WriteReadyObserver, TimestampEntity, firestoreExOptions }
