import * as admin from 'firebase-admin'
import { DocumentReference, Query, Transaction } from '@google-cloud/firestore'
import { Injectable, Module } from '@nestjs/common'

//========================================================================
//
//  Implementation
//
//========================================================================

@Injectable()
class FirestoreService {
  /**
   * 指定されたコレクションを再帰的に削除します。
   * @param collectionPath
   * @param tx
   */
  async deepDeleteCollection(collectionPath: string, tx?: Transaction): Promise<void> {
    const db = admin.firestore()

    const collectionRef = db.collection(collectionPath)
    const query = collectionRef.orderBy('__name__')

    const docRefs = await this.m_getDeepDocRefs(query, tx)
    if (tx) {
      for (const docRef of docRefs) {
        tx.delete(docRef)
      }
    } else {
      await Promise.all(
        docRefs.map(async docRef => {
          await docRef.delete()
        })
      )
    }
  }

  /**
   * 指定されたクエリを実行し、その結果からさらにクエリの作成・実行を繰り返して、
   * 再帰的にドキュメントリファレンスを取得します。
   * @param query
   * @param tx
   */
  private async m_getDeepDocRefs(query: Query, tx?: Transaction): Promise<DocumentReference[]> {
    const snap = tx ? await tx.get(query) : await query.get()
    if (snap.size === 0) return []

    const result: DocumentReference[] = []

    const subCollectionPromises: Promise<DocumentReference[]>[] = []
    for (const doc of snap.docs) {
      const subCollectionPromise = doc.ref.listCollections().then(async subCollections => {
        const promises: Promise<DocumentReference[]>[] = []
        for (const subCollection of subCollections || []) {
          const subQuery = subCollection.orderBy('__name__')
          const subPromise = this.m_getDeepDocRefs(subQuery, tx)
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

namespace FirestoreServiceDI {
  export const symbol = Symbol(FirestoreService.name)
  export const provider = {
    provide: symbol,
    useClass: FirestoreService,
  }
  export type type = FirestoreService
}

@Module({
  providers: [FirestoreServiceDI.provider],
  exports: [FirestoreServiceDI.provider],
})
class FirestoreServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { FirestoreServiceDI, FirestoreServiceModule }
