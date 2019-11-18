import * as admin from 'firebase-admin'
import { DocumentReference, Query, Transaction } from '@google-cloud/firestore'
import { Injectable } from '@nestjs/common'

//========================================================================
//
//  Basis
//
//========================================================================

@Injectable()
class FirestoreService {
  /**
   * 指定されたコレクションを再帰的に削除します。
   * @param collectionPath
   * @param batchSize
   */
  async deepDeleteCollection(collectionPath: string, batchSize = 500): Promise<void> {
    const db = admin.firestore()

    const collectionRef = db.collection(collectionPath)
    const query = collectionRef.orderBy('__name__').limit(batchSize)

    await db.runTransaction(async transaction => {
      const docRefs = await this.m_getDeepDocRefs(transaction, query, batchSize)
      for (const docRef of docRefs) {
        transaction.delete(docRef)
      }
    })
  }

  /**
   * 指定されたクエリを実行し、その結果からさらにクエリの作成・実行を繰り返して、
   * 再帰的にドキュメントリファレンスを取得します。
   * @param transaction
   * @param query
   * @param batchSize
   */
  private async m_getDeepDocRefs(transaction: Transaction, query: Query, batchSize: number): Promise<DocumentReference[]> {
    const snapshot = await transaction.get(query)
    if (snapshot.size === 0) return []

    const result: DocumentReference[] = []

    const subCollectionPromises: Promise<DocumentReference[]>[] = []
    for (const doc of snapshot.docs) {
      const subCollectionPromise = doc.ref.listCollections().then(async subCollections => {
        const promises: Promise<DocumentReference[]>[] = []
        for (const subCollection of subCollections || []) {
          const subQuery = subCollection.orderBy('__name__').limit(batchSize)
          const subPromise = this.m_getDeepDocRefs(transaction, subQuery, batchSize)
          promises.push(subPromise)
        }
        return (await Promise.all(promises)).reduce<DocumentReference[]>((result, docRefs) => {
          result.push(...docRefs)
          return result
        }, [])
      })
      subCollectionPromises.push(subCollectionPromise)
      result.push(doc.ref)
    }

    return (await Promise.all(subCollectionPromises)).reduce<DocumentReference[]>((result, docRefs) => {
      result.push(...docRefs)
      return result
    }, result)
  }
}

//========================================================================
//
//  Concrete
//
//========================================================================

export namespace FirestoreServiceDI {
  export const symbol = Symbol(FirestoreService.name)
  export const provider = {
    provide: symbol,
    useClass: FirestoreService,
  }
  export type type = FirestoreService
}
