import { Entity, FirestoreEx } from '../../../src/firestore-ex'
import { AdminFirestoreTestUtil } from './util'

const util = new AdminFirestoreTestUtil()
const db = util.db
const collectionPath = util.collectionPath
const firestoreEx = new FirestoreEx(db)

export interface TestDoc extends Entity {
  id: string
  title: string
  order: number
}

afterAll(async () => {
  await util.deleteApps()
})

describe('query', () => {
  const dao = firestoreEx.collection<TestDoc>({ path: collectionPath })

  beforeEach(async () => {
    await dao.collectionRef.add({ title: 'aaa', order: 2 })
    await dao.collectionRef.add({ title: 'aaa', order: 1 })
    await dao.collectionRef.add({ title: 'bbb', order: 3 })
    await dao.collectionRef.add({ title: 'ccc', order: 4 })
  })

  afterEach(async () => {
    await util.deleteCollection()
  })

  it('where ==', async () => {
    const queryTitle = 'aaa'
    const docs = await dao.where('title', '==', queryTitle).fetch()

    const actualTitles = docs.map(doc => doc.title)
    expect(actualTitles).toEqual([queryTitle, queryTitle])
  })

  it('order by desc', async () => {
    const docs = await dao.orderBy('order', 'desc').fetch()

    const actualOrders = docs.map(doc => doc.order)
    expect(actualOrders).toEqual([4, 3, 2, 1])
  })

  it('limit', async () => {
    const limit = 1
    const docs = await dao.limit(limit).fetch()

    expect(docs).toHaveLength(limit)
  })

  it('offset', async () => {
    const offset = 1
    const docs = await dao.orderBy('order').offset(offset).fetch()

    expect(docs.map(doc => doc.order)).toEqual([2, 3, 4])
  })

  describe('composition', () => {
    it('where + where', async () => {
      const docs = await dao.where('order', '>', 1).where('order', '<', 4).fetch()

      const expectOrders = [2, 3]
      const actualOrders = docs.map(doc => doc.order)
      expect(actualOrders).toEqual(expectOrders)
    })

    it('where + limit', async () => {
      const queryTitle = 'aaa'
      const limit = 1
      const docs = await dao.where('title', '==', queryTitle).limit(limit).fetch()

      expect(docs).toHaveLength(limit)

      const doc = docs[0]
      expect(doc.title).toBe(queryTitle)
    })

    it('order + limit', async () => {
      const limit = 2
      const docs = await dao.orderBy('order').limit(limit).fetch()

      expect(docs).toHaveLength(limit)

      const actualOrders = docs.map(doc => doc.order)
      expect(actualOrders).toEqual([1, 2])
    })
  })
})
