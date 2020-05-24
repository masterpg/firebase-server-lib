import { AdminFirestoreTestUtil, createRandomCollectionName } from './util'
import { Collection, Entity, FirestoreEx } from '../../../src/firestore-ex'

const util = new AdminFirestoreTestUtil()
const db = util.db
const collectionPath = util.collectionPath
const firestoreEx = new FirestoreEx(db)

interface TestDoc extends Entity {
  title: string
}

describe('transaction', () => {
  let txFirestoreEx: FirestoreEx
  let txDao: Collection<TestDoc>
  const dao = firestoreEx.collection<TestDoc>({ path: collectionPath })

  beforeEach(async () => {
    txFirestoreEx = new FirestoreEx(db)
    txDao = txFirestoreEx.collection<TestDoc>({ path: collectionPath })
  })

  afterAll(async () => {
    await util.deleteApps()
  })

  afterEach(async () => {
    await util.deleteCollection()
  })

  describe('context.tx', () => {
    it('should be undefined before transaction', async () => {
      expect(txFirestoreEx.context.tx).toBeUndefined()
    })

    it('should be assigned in transaction', async () => {
      await txFirestoreEx.runTransaction(async tx => {
        expect(txFirestoreEx.context.tx).toBe(tx)
      })
    })

    it('should be undefined after transaction', async () => {
      await txFirestoreEx.runTransaction(async _tx => {
        expect(txFirestoreEx.context.tx).toBeDefined()
      })

      expect(txFirestoreEx.context.tx).toBeUndefined()
    })

    it('should be undefined if an error occurs', async () => {
      let actual!: Error
      try {
        await txFirestoreEx.runTransaction(async _tx => {
          throw new Error()
        })
      } catch (err) {
        actual = err
      }

      expect(actual).toBeInstanceOf(Error)
      expect(txFirestoreEx.context.tx).toBeUndefined()
    })

    it('should be error nesting transaction', async () => {
      await txFirestoreEx.runTransaction(async _tx => {
        expect(
          txFirestoreEx.runTransaction(async _tx => {
            dao.add({ title: 'test' })
          })
        ).rejects.toThrow()
      })
    })

    it('should be error runBatch in transaction', async () => {
      await txFirestoreEx.runTransaction(async _tx => {
        expect(
          txFirestoreEx.runBatch(async _batch => {
            dao.add({ title: 'test' })
          })
        ).rejects.toThrow()
      })
    })
  })

  describe('Collection', () => {
    describe('write method', () => {
      it('set', async () => {
        const docId = await dao.set({ id: 'test1', title: 'aaa' })
        const doc = (await dao.fetch(docId))!
        const updatedDoc = { id: 'test1', title: 'bbb' }

        await txFirestoreEx.runTransaction(async () => {
          await txDao.set(updatedDoc)

          // Set document can't see outside transaction
          const outTxFetched = await dao.fetch(doc.id)
          expect(outTxFetched).toEqual(doc)
        })

        // Set document can see after transaction
        const fetched = (await dao.fetch(doc.id))!
        expect(fetched).toMatchObject(updatedDoc)
        expect(fetched.createdAt.isAfter(doc.createdAt)).toBeTruthy()
        expect(fetched.updatedAt.isAfter(doc.updatedAt)).toBeTruthy()
      })

      it('delete', async () => {
        const docId = await dao.set({ id: 'test1', title: 'aaa' })
        const doc = (await dao.fetch(docId))!

        await txFirestoreEx.runTransaction(async () => {
          await txDao.delete(doc.id)

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

        await txFirestoreEx.runTransaction(async () => {
          newId = await txDao.add(doc)

          // Added document can't see outside transaction
          const outTxFetched = await dao.fetch(newId)
          expect(outTxFetched).toBeUndefined()
        })

        // Added document can see after transaction
        const fetched = (await dao.fetch(newId))!
        expect(fetched).toMatchObject(doc)
        expect(fetched.createdAt.isValid()).toBeTruthy()
        expect(fetched.updatedAt.isValid()).toBeTruthy()
      })

      it('update', async () => {
        const docId = await dao.set({ id: 'test2', title: 'aaa' })
        const doc = (await dao.fetch(docId))!
        const updatedTitle = 'update'

        await txFirestoreEx.runTransaction(async () => {
          await txDao.update({ id: doc.id, title: updatedTitle })

          // Updated document can't see outside transaction
          const outTxFetched = await dao.fetch(doc.id)
          expect(outTxFetched!.title).toEqual(doc.title)
        })

        // Updated document can see after transaction
        const fetched = (await dao.fetch(doc.id))!
        expect(fetched!.title).toEqual(updatedTitle)
      })
    })

    describe('read method', () => {
      it('fetch after set in transaction should be error', async () => {
        const doc = { id: 'test1', title: 'aaa' }
        const updatedDoc = { id: 'test1', title: 'bbb' }
        await dao.set(doc)

        await txFirestoreEx.runTransaction(async () => {
          await txDao.set(updatedDoc)

          // Firestore throw error READ after WRITE in same transaction.
          // To show txDao.fetch() is inside transaction, assert transaction error.
          await expect(txDao.fetch(doc.id)).rejects.toThrow('Firestore transactions require all reads to be executed before all writes.')
        })
      })

      it('fetchAll after set in transaction should be error', async () => {
        const doc = { id: 'test1', title: 'aaa' }
        const updatedDoc = { id: 'test1', title: 'bbb' }
        await dao.set(doc)

        await txFirestoreEx.runTransaction(async () => {
          await txDao.set(updatedDoc)

          // Firestore throw error READ after WRITE in same transaction.
          // To show txDao.fetchAll() is inside transaction, assert transaction error.
          await expect(txDao.fetchAll()).rejects.toThrow('Firestore transactions require all reads to be executed before all writes.')
        })
      })

      it('query after set in transaction should be error', async () => {
        const doc = { id: 'test1', title: 'aaa' }
        const updatedDoc = { id: 'test1', title: 'bbb' }
        await dao.set(doc)

        await txFirestoreEx.runTransaction(async () => {
          await txDao.set(updatedDoc)

          // Firestore throw error READ after WRITE in same transaction.
          // To show txDao.where().fetch() is inside transaction, assert transaction error.
          await expect(txDao.where('title', '==', 'bbb').fetch()).rejects.toThrow(
            'Firestore transactions require all reads to be executed before all writes.'
          )
        })
      })
    })
  })

  describe('Collection.context.tx', () => {
    const anotherCollectionPath = createRandomCollectionName()
    let txAnotherDao: Collection<TestDoc>

    beforeEach(async () => {
      txAnotherDao = txFirestoreEx.collection<TestDoc>({ path: anotherCollectionPath })
    })

    it('each collections share same transaction context', async () => {
      await txFirestoreEx.runTransaction(async tx => {
        expect(txDao.context.tx).toBe(tx)
        expect(txAnotherDao.context.tx).toBe(tx)
      })
    })

    it('transaction enables across each collections', async () => {
      const anotherDao = firestoreEx.collection<TestDoc>({ path: anotherCollectionPath })

      const docId = await dao.set({ id: 'test1', title: 'aaa' })
      const doc = (await dao.fetch(docId))!
      const anotherId = await anotherDao.set({ id: 'test1', title: 'another' })
      const anotherDoc = (await anotherDao.fetch(anotherId))!

      const updatedDoc = { id: 'test1', title: 'bbb' }
      const updatedAnotherDoc = { id: 'test1', title: 'another_bbb' }

      await txFirestoreEx.runTransaction(async () => {
        await txDao.update(updatedDoc)
        await txAnotherDao.update(updatedAnotherDoc)

        // Updated document can't see outside transaction
        const outTxFetched = await dao.fetch(doc.id)
        expect(outTxFetched).toEqual(doc)
        const outTxAnotherFetched = await anotherDao.fetch(anotherDoc.id)
        expect(outTxAnotherFetched).toEqual(anotherDoc)
      })

      // Updated document can see after transaction
      const fetched = (await dao.fetch(doc.id))!
      expect(fetched).toMatchObject(updatedDoc)
      expect(fetched.createdAt).toEqual(doc.createdAt)
      expect(fetched.updatedAt.isAfter(doc.updatedAt)).toBeTruthy()

      const anotherFetched = (await anotherDao.fetch(anotherDoc.id))!
      expect(anotherFetched).toMatchObject(updatedAnotherDoc)
      expect(anotherFetched.createdAt).toEqual(anotherDoc.createdAt)
      expect(anotherFetched.updatedAt.isAfter(anotherDoc.updatedAt)).toBeTruthy()
    })
  })
})
