import { FirestoreExOptions, TimestampEntity as _TimestampEntity } from '../../firestore-ex'
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
  timestampToDate: timestamp => dayjs(timestamp.toDate()),
}

/**
 * Firestoreのトランザクションで複数の処理を並列実行する際、
 * 各処理の書き込み処理の準備が整うまで待機するのを制御するためのオブザーバーです。
 */
class WriteReadyObserver {
  constructor(private m_num: number) {}

  private m_resolves: Array<() => void> = []

  wait(): Promise<void> {
    const result = new Promise<void>(resolve => {
      this.m_resolves.push(resolve)
    })
    this.m_decrement()
    return result
  }

  private m_decrement(): void {
    this.m_num--
    if (this.m_num === 0) {
      for (const resolve of this.m_resolves) {
        resolve()
      }
    }
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export { WriteReadyObserver, TimestampEntity, firestoreExOptions }
