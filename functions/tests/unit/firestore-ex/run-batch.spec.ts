import { AdminFirestoreTestUtil, createRandomCollectionName } from './util'
import { Collection, Entity, FirestoreEx } from '../../../src/firestore-ex'

const util = new AdminFirestoreTestUtil()
const db = util.db
const collectionPath = util.collectionPath

interface TestDoc extends Entity {
  title: string
}

describe('runBatch', () => {
  let firestoreEx: FirestoreEx
  let dao: Collection<TestDoc>

  beforeEach(async () => {
    firestoreEx = new FirestoreEx(db)
    dao = firestoreEx.collection<TestDoc>({ path: collectionPath })
  })

  afterAll(async () => {
    await util.deleteApps()
  })

  afterEach(async () => {
    await util.deleteCollection()
  })

  describe('context.batch', () => {
    it('should be undefined before runBatch', async () => {
      expect(firestoreEx.context.batch).toBeUndefined()
    })

    it('should be assigned in runBatch', async () => {
      await firestoreEx.runBatch(async batch => {
        expect(firestoreEx.context.batch).toBe(batch)
      })
    })

    it('should be undefined after runBatch', async () => {
      await firestoreEx.runBatch(async () => {
        expect(firestoreEx.context.batch).not.toBeUndefined()
      })

      expect(firestoreEx.context.batch).toBeUndefined()
    })

    it('should be undefined if an error occurs', async () => {
      let actual!: Error
      try {
        await firestoreEx.runBatch(async () => {
          throw new Error()
        })
      } catch (err) {
        actual = err
      }

      expect(actual).toBeInstanceOf(Error)
      expect(firestoreEx.context.batch).toBeUndefined()
    })

    it('should be error nesting runBatch', async () => {
      await firestoreEx.runBatch(async () => {
        expect(
          firestoreEx.runBatch(async () => {
            dao.add({ title: 'test' })
          })
        ).rejects.toThrow()
      })
    })

    it('should be error transaction in runBatch', async () => {
      await firestoreEx.runBatch(async () => {
        expect(
          firestoreEx.runTransaction(async () => {
            dao.add({ title: 'test' })
          })
        ).rejects.toThrow()
      })
    })
  })

  describe('write method', () => {
    it('set', async () => {
      const docId = await dao.set({ id: 'test1', title: 'aaa' })
      const doc = (await dao.fetch(docId))!
      const updatedDoc = { id: 'test1', title: 'bbb' }

      await firestoreEx.runBatch(async () => {
        await dao.set(updatedDoc)

        // document has not updated yet
        const fetchedOutsideBatch = (await dao.fetch(doc.id))!
        expect(fetchedOutsideBatch).toEqual(doc)
      })

      // document has updated outside runBatch
      const fetched = (await dao.fetch(doc.id))!
      expect(fetched).toEqual(updatedDoc)
    })

    it('delete', async () => {
      const docId = await dao.set({ id: 'test1', title: 'aaa' })
      const doc = (await dao.fetch(docId))!

      await firestoreEx.runBatch(async () => {
        await dao.delete(doc.id)

        // document has not deleted yet
        const fetchedOutsideBatch = (await dao.fetch(doc.id))!
        expect(fetchedOutsideBatch).toEqual(doc)
      })

      // document has deleted outside runBatch
      const fetched = (await dao.fetch(doc.id))!
      expect(fetched).toBeUndefined()
    })

    it('add', async () => {
      const doc = { title: 'aaa' }
      let newId!: string

      await firestoreEx.runBatch(async () => {
        newId = await dao.add(doc)

        // document has not added yet
        const fetchedOutsideBatch = await dao.fetch(newId)
        expect(fetchedOutsideBatch).toBeUndefined()
      })

      // document has added outside runBatch
      const fetched = await dao.fetch(newId)
      expect(fetched).toBeDefined()
    })

    it('update', async () => {
      const docId = await dao.set({ id: 'test2', title: 'aaa' })
      const doc = (await dao.fetch(docId))!
      const updatedTitle = 'update'

      await firestoreEx.runBatch(async () => {
        await dao.update({ id: doc.id, title: updatedTitle })

        // document has not updated yet
        const fetchedOutsideBatch = (await dao.fetch(doc.id))!
        expect(fetchedOutsideBatch).toEqual(doc)
      })

      // document has updated outside runBatch
      const fetched = (await dao.fetch(doc.id))!
      expect(fetched!.title).toEqual(updatedTitle)
    })
  })

  describe('Collection.context.batch', () => {
    const anotherCollectionPath = createRandomCollectionName()
    let batchAnotherDao: Collection<TestDoc>

    beforeEach(async () => {
      batchAnotherDao = firestoreEx.collection<TestDoc>({ path: anotherCollectionPath })
    })

    it('each collections share same batch context', async () => {
      await firestoreEx.runBatch(async batch => {
        expect(dao.context.batch).toBe(batch)
        expect(batchAnotherDao.context.batch).toBe(batch)
      })
    })

    it('runBatch enables across each collections', async () => {
      // it share same context.batch
      const anotherDao = firestoreEx.collection<TestDoc>({ path: anotherCollectionPath })

      const docId = await dao.set({ id: 'test1', title: 'aaa' })
      const doc = (await dao.fetch(docId))!
      const anotherId = await anotherDao.set({ id: 'test1', title: 'another' })
      const anotherDoc = (await anotherDao.fetch(anotherId))!

      const updatedDoc = { id: 'test1', title: 'bbb' }
      const updatedAnotherDoc = { id: 'test1', title: 'another_bbb' }

      await firestoreEx.runBatch(async () => {
        await dao.update(updatedDoc)
        await batchAnotherDao.update(updatedAnotherDoc)

        // Both documents has not updated yet
        const fetchedOutsideBatch = await dao.fetch(doc.id)
        expect(fetchedOutsideBatch).toEqual(doc)
        const anotherFetchedOutsideBatch = await anotherDao.fetch(anotherDoc.id)
        expect(anotherFetchedOutsideBatch).toEqual(anotherDoc)
      })

      // Both documents has updated outside runBatch
      const fetched = (await dao.fetch(doc.id))!
      expect(fetched).toEqual(updatedDoc)

      const anotherFetched = (await anotherDao.fetch(anotherDoc.id))!
      expect(anotherFetched).toEqual(updatedAnotherDoc)
    })

    it('should be error bulkSet in runBatch', async () => {
      await firestoreEx.runBatch(async () => {
        const doc = [{ id: 'test1', title: 'aaa' }]
        expect(dao.bulkSet(doc)).rejects.toThrow()
      })
    })

    it('should be error bulkDelete in runBatch', async () => {
      const doc = { id: 'test1', title: 'aaa' }
      await dao.set(doc)

      await firestoreEx.runBatch(async () => {
        expect(dao.bulkDelete([doc.id])).rejects.toThrow()
      })
    })
  })
})
