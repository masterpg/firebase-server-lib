import { Entity, FirestoreEx } from '../../../src/firestore-ex'
import { AdminFirestoreTestUtil } from './util'

const util = new AdminFirestoreTestUtil()
const db = util.db
// Set specific collection name because random name collection can not handle composite index in real firestore.
const collectionPath = `${util.collectionPath}/test/test_pagination`
const firestoreEx = new FirestoreEx(db)

export interface TestDoc extends Entity {
  title: string
  order: number
}

afterAll(async () => {
  await util.deleteApps()
})

describe('pagination', () => {
  const dao = firestoreEx.collection<TestDoc>({ path: collectionPath })

  beforeEach(async () => {
    const docs = [
      { id: '1', title: 'a', order: 1 },
      { id: '2', title: 'b', order: 2 },
      { id: '3', title: 'b', order: 3 },
      { id: '4', title: 'c', order: 4 },
      { id: '5', title: 'd', order: 5 },
      { id: '6', title: 'd', order: 6 },
      { id: '7', title: 'e', order: 7 },
    ]
    await dao.bulkSet(docs)
  })

  afterEach(async () => {
    await util.deleteCollection()
  })

  describe('startAt', () => {
    it('with field value', async () => {
      const fetched = await dao.orderBy('title').startAt('b').fetch()
      const actual = fetched[0]

      expect(actual).toMatchObject({ id: '2', title: 'b', order: 2 })
    })

    it('with multiple field values', async () => {
      const fetched = await dao.orderBy('title').orderBy('order').startAt('b', 3).fetch()
      const actual = fetched[0]

      expect(actual).toMatchObject({ id: '3', title: 'b', order: 3 })
    })

    it('with DocumentSnapshot', async () => {
      const snap = await dao.docRef('3').get()
      const fetched = await dao.orderBy('title').startAt(snap).fetch()
      const actual = fetched[0]

      expect(actual).toMatchObject({ id: '3', title: 'b', order: 3 })
    })
  })

  describe('startAfter', () => {
    it('with field value', async () => {
      const fetched = await dao.orderBy('title').startAfter('b').fetch()
      const actual = fetched[0]

      expect(actual).toMatchObject({ id: '4', title: 'c', order: 4 })
    })

    it('with DocumentSnapshot', async () => {
      const snap = await dao.docRef('3').get()
      const fetched = await dao.orderBy('title').startAfter(snap).fetch()
      const actual = fetched[0]

      expect(actual).toMatchObject({ id: '4', title: 'c', order: 4 })
    })
  })

  describe('endAt', () => {
    it('with field value', async () => {
      const fetched = await dao.orderBy('title').endAt('d').fetch()
      const actual = fetched[fetched.length - 1]

      expect(actual).toMatchObject({ id: '6', title: 'd', order: 6 })
    })

    it('with DocumentSnapshot', async () => {
      const snap = await dao.docRef('6').get()
      const fetched = await dao.orderBy('title').endAt(snap).fetch()
      const actual = fetched[fetched.length - 1]

      expect(actual).toMatchObject({ id: '6', title: 'd', order: 6 })
    })
  })

  describe('endBefore', () => {
    it('with field value', async () => {
      const fetched = await dao.orderBy('title').endBefore('e').fetch()
      const actual = fetched[fetched.length - 1]

      expect(actual).toMatchObject({ id: '6', title: 'd', order: 6 })
    })

    it('with DocumentSnapshot', async () => {
      const snap = await dao.docRef('7').get()
      const fetched = await dao.orderBy('title').endBefore(snap).fetch()
      const actual = fetched[fetched.length - 1]

      expect(actual).toMatchObject({ id: '6', title: 'd', order: 6 })
    })
  })

  describe('startAfter + endAt', () => {
    it('with field value', async () => {
      const fetched = await dao.orderBy('title').startAfter('b').endAt('d').fetch()
      const actualFirst = fetched[0]
      const actualLast = fetched[fetched.length - 1]

      expect(actualFirst).toMatchObject({ id: '4', title: 'c', order: 4 })
      expect(actualLast).toMatchObject({ id: '6', title: 'd', order: 6 })
    })
  })
})
