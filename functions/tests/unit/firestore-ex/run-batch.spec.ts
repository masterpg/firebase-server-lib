import { AdminFirestoreTestUtil, createRandomCollectionName } from './util'
import { Entity, FirestoreEx } from '../../../src/firestore-ex'

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

describe('runBatch', () => {
  const dao = firestoreEx.collection<TestDoc>({ path: collectionPath })

  afterEach(async () => {
    await util.deleteCollection()
  })

  describe('write method', () => {
    it('set', async () => {
      const docId = await dao.set({ id: 'test1', title: 'aaa' })
      const doc = (await dao.fetch(docId))!
      const updatedDoc = { id: 'test1', title: 'bbb' }

      await firestoreEx.runBatch(async batch => {
        await dao.set(updatedDoc, batch)

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

      await firestoreEx.runBatch(async batch => {
        await dao.delete(doc.id, batch)

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

      await firestoreEx.runBatch(async batch => {
        newId = await dao.add(doc, batch)

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

      await firestoreEx.runBatch(async batch => {
        await dao.update({ id: doc.id, title: updatedTitle }, batch)

        // document has not updated yet
        const fetchedOutsideBatch = (await dao.fetch(doc.id))!
        expect(fetchedOutsideBatch).toEqual(doc)
      })

      // document has updated outside runBatch
      const fetched = (await dao.fetch(doc.id))!
      expect(fetched!.title).toEqual(updatedTitle)
    })

    it('runBatch enables across each collections', async () => {
      const anotherDao = firestoreEx.collection<TestDoc>({ path: anotherCollectionPath })

      const docId = await dao.set({ id: 'test1', title: 'aaa' })
      const doc = (await dao.fetch(docId))!
      const anotherId = await anotherDao.set({ id: 'test1', title: 'another' })
      const anotherDoc = (await anotherDao.fetch(anotherId))!

      const updatedDoc = { id: 'test1', title: 'bbb' }
      const updatedAnotherDoc = { id: 'test1', title: 'another_bbb' }

      await firestoreEx.runBatch(async batch => {
        await dao.update(updatedDoc, batch)
        await anotherDao.update(updatedAnotherDoc, batch)

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
  })
})
