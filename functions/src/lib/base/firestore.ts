import * as admin from 'firebase-admin'
import { DocumentReference, Transaction } from '@google-cloud/firestore'

//========================================================================
//
//  Interfaces
//
//========================================================================

/**
 * ドキュメントデータの共通項目を定義したインタフェースです。
 */
interface DocumentData {
  id: string
}

/**
 * @see admin.firestore.DocumentSnapshot
 */
interface DocumentSnapshot<DOCUMENT extends DocumentData> extends admin.firestore.DocumentSnapshot<DOCUMENT> {}

/**
 * ドキュメントがデータベースに実際に存在する場合、このインタフェースを使用してください。
 * これにより`data()`の戻り値が返却されることを前提にコーディングできます。
 */
interface RequiredDocumentSnapshot<DOCUMENT extends DocumentData> extends DocumentSnapshot<DOCUMENT> {
  data(): DOCUMENT
}

//========================================================================
//
//  Implementation
//
//========================================================================

/**
 * 指定されたIDのドキュメントを取得します。
 * @param collectionPath
 * @param ids
 * @param transaction
 */
async function getDocumentsByIds<DOCUMENT extends DocumentData>(
  collectionPath: string,
  ids: string[],
  transaction?: Transaction
): Promise<DocumentSnapshot<DOCUMENT>[]> {
  return await Promise.all(
    ids.map(async id => {
      return await getDocumentById<DOCUMENT>(collectionPath, id, transaction)
    })
  )
}

/**
 * 指定されたIDのドキュメントを取得します。
 * @param collectionPath
 * @param id
 * @param transaction
 */
async function getDocumentById<DOCUMENT extends DocumentData>(
  collectionPath: string,
  id: string,
  transaction?: Transaction
): Promise<DocumentSnapshot<DOCUMENT>> {
  const db = admin.firestore()
  const ref = db.collection(collectionPath).doc(id) as DocumentReference<DOCUMENT>
  let snap: DocumentSnapshot<DOCUMENT>
  if (transaction) {
    snap = await transaction.get(ref)
  } else {
    snap = await ref.get()
  }
  if (snap.exists) {
    ;(snap as any).original_data = snap.data
    snap.data = () => {
      return { ...(snap as any).original_data()!, id: snap.id }
    }
  }
  return snap
}

/**
 * 指定されたドキュメントのIDをキーにした連想配列に変換します。
 * @param snaps
 */
function documentsToDict<DOCUMENT extends DocumentData>(snaps: DocumentSnapshot<DOCUMENT>[]): { [id: string]: RequiredDocumentSnapshot<DOCUMENT> } {
  return snaps.reduce<{ [id: string]: RequiredDocumentSnapshot<DOCUMENT> }>((result, snap) => {
    result[snap.id] = snap as RequiredDocumentSnapshot<DOCUMENT>
    return result
  }, {})
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

export { DocumentData, DocumentSnapshot, RequiredDocumentSnapshot, getDocumentsByIds, getDocumentById, documentsToDict, WriteReadyObserver }
