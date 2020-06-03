import { AdminFirestoreTestUtil, createRandomCollectionName } from './util'
import { Collection, Entity, FirestoreEx } from '../../../src/firestore-ex'

const util = new AdminFirestoreTestUtil()
const db = util.db
const collectionPath = util.collectionPath
const anotherCollectionPath = createRandomCollectionName()
const firestoreEx = new FirestoreEx(db)

interface TestDoc extends Entity {
  title: string
}

afterAll(async () => {
  await util.deleteApps()
})

describe('transaction', () => {
  const dao = firestoreEx.collection<TestDoc>({ path: collectionPath })

  afterEach(async () => {
    await util.deleteCollection()
  })

  describe('Collection', () => {
    describe('write method', () => {
      it('set', async () => {
        const docId = await dao.set({ id: 'test1', title: 'aaa' })
        const doc = (await dao.fetch(docId))!
        const updatedDoc = { id: 'test1', title: 'bbb' }

        await firestoreEx.runTransaction(async tx => {
          await dao.set(updatedDoc, tx)

          // Set document can't see outside transaction
          const outTxFetched = await dao.fetch(doc.id)
          expect(outTxFetched).toEqual(doc)
        })

        // Set document can see after transaction
        const fetched = (await dao.fetch(doc.id))!
        expect(fetched).toEqual(updatedDoc)
      })

      it('delete', async () => {
        const docId = await dao.set({ id: 'test1', title: 'aaa' })
        const doc = (await dao.fetch(docId))!

        await firestoreEx.runTransaction(async tx => {
          await dao.delete(doc.id, tx)

          // Deleted document can't see outside transaction
          const outTxFetched = await dao.fetch(doc.id)
          expect(outTxFetched).toEqual(doc)
        })

        // Deleted document can see after transaction
        const fetched = await dao.fetch(doc.id)
        expect(fetched).toBeUndefined()
      })

      it('add', async () => {
        let newId!: string
        const doc = { title: 'aaa' }

        await firestoreEx.runTransaction(async tx => {
          newId = await dao.add(doc, tx)

          // Added document can't see outside transaction
          const outTxFetched = await dao.fetch(newId)
          expect(outTxFetched).toBeUndefined()
        })

        // Added document can see after transaction
        const fetched = (await dao.fetch(newId))!
        expect(fetched).toEqual({ id: newId, ...doc })
      })

      it('update', async () => {
        const docId = await dao.set({ id: 'test2', title: 'aaa' })
        const doc = (await dao.fetch(docId))!
        const updatedTitle = 'update'

        await firestoreEx.runTransaction(async tx => {
          await dao.update({ id: doc.id, title: updatedTitle }, tx)

          // Updated document can't see outside transaction
          const outTxFetched = await dao.fetch(doc.id)
          expect(outTxFetched!.title).toEqual(doc.title)
        })

        // Updated document can see after transaction
        const fetched = (await dao.fetch(doc.id))!
        expect(fetched!.title).toEqual(updatedTitle)
      })

      it('transaction enables across each collections', async () => {
        const anotherDao = firestoreEx.collection<TestDoc>({ path: anotherCollectionPath })

        const docId = await dao.set({ id: 'test1', title: 'aaa' })
        const doc = (await dao.fetch(docId))!
        const anotherId = await anotherDao.set({ id: 'test1', title: 'another' })
        const anotherDoc = (await anotherDao.fetch(anotherId))!

        const updatedDoc = { id: 'test1', title: 'bbb' }
        const updatedAnotherDoc = { id: 'test1', title: 'another_bbb' }

        await firestoreEx.runTransaction(async tx => {
          await dao.update(updatedDoc, tx)
          await anotherDao.update(updatedAnotherDoc, tx)

          // Updated document can't see outside transaction
          const outTxFetched = await dao.fetch(doc.id)
          expect(outTxFetched).toEqual(doc)
          const outTxAnotherFetched = await anotherDao.fetch(anotherDoc.id)
          expect(outTxAnotherFetched).toEqual(anotherDoc)
        })

        // Updated document can see after transaction
        const fetched = (await dao.fetch(doc.id))!
        expect(fetched).toEqual(updatedDoc)

        const anotherFetched = (await anotherDao.fetch(anotherDoc.id))!
        expect(anotherFetched).toEqual(updatedAnotherDoc)
      })
    })

    describe('read method', () => {
      it('fetch after set in transaction should be error', async () => {
        const doc = { id: 'test1', title: 'aaa' }
        const updatedDoc = { id: 'test1', title: 'bbb' }
        await dao.set(doc)

        await firestoreEx.runTransaction(async tx => {
          await dao.set(updatedDoc, tx)

          // Firestore throw error READ after WRITE in same transaction.
          // To show dao.fetch() is inside transaction, assert transaction error.
          await expect(dao.fetch(doc.id, tx)).rejects.toThrow('Firestore transactions require all reads to be executed before all writes.')
        })
      })

      it('fetchAll after set in transaction should be error', async () => {
        const doc = { id: 'test1', title: 'aaa' }
        const updatedDoc = { id: 'test1', title: 'bbb' }
        await dao.set(doc)

        await firestoreEx.runTransaction(async tx => {
          await dao.set(updatedDoc, tx)

          // Firestore throw error READ after WRITE in same transaction.
          // To show dao.fetchAll(tx) is inside transaction, assert transaction error.
          await expect(dao.fetchAll(tx)).rejects.toThrow('Firestore transactions require all reads to be executed before all writes.')
        })
      })

      it('query after set in transaction should be error', async () => {
        const doc = { id: 'test1', title: 'aaa' }
        const updatedDoc = { id: 'test1', title: 'bbb' }
        await dao.set(doc)

        await firestoreEx.runTransaction(async tx => {
          await dao.set(updatedDoc, tx)

          // Firestore throw error READ after WRITE in same transaction.
          // To show dao.where(...).fetch(tx) is inside transaction, assert transaction error.
          await expect(dao.where('title', '==', 'bbb').fetch(tx)).rejects.toThrow(
            'Firestore transactions require all reads to be executed before all writes.'
          )
        })
      })
    })
  })
})
