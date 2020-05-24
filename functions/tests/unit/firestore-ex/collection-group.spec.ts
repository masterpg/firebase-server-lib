import { AdminFirestoreTestUtil, TestTimestampEntity, deleteCollection } from './util'
import { Entity, FirestoreEx } from '../../../src/firestore-ex'
import { Timestamp } from '@google-cloud/firestore'
import dayjs = require('dayjs')

const util = new AdminFirestoreTestUtil()
const db = util.db
const collectionPath = util.collectionPath
const firestoreEx = new FirestoreEx(db)

interface TestDoc extends Entity {
  title: string
}

const expectTitles = ['aaa', 'bbb', 'ccc', 'ddd']
const collectionId = 'collection_group'

afterAll(async () => {
  await util.deleteApps()
})

describe('collectionGroup', () => {
  beforeEach(async () => {
    await db.collection(`${collectionPath}/1/${collectionId}`).add({ title: expectTitles[0] })
    await db.collection(`${collectionPath}/1/${collectionId}`).add({ title: expectTitles[1] })
    await db.collection(`${collectionPath}/2/${collectionId}`).add({ title: expectTitles[2] })
    await db.collection(`${collectionPath}/3/${collectionId}`).add({ title: expectTitles[3] })
  })

  afterEach(async () => {
    await deleteCollection(db, `${collectionPath}/1/${collectionId}`)
    await deleteCollection(db, `${collectionPath}/2/${collectionId}`)
    await deleteCollection(db, `${collectionPath}/3/${collectionId}`)
  })

  it('fetch', async () => {
    const query = firestoreEx.collectionGroup<TestDoc>({ collectionId })
    const docs = await query.fetch()

    expect(docs.length).toBe(4)
    docs.sort((a, b) => {
      return a.title < b.title ? -1 : a.title > b.title ? 1 : 0
    })
    docs.forEach((doc, i) => {
      expect(doc.title).toBe(expectTitles[i])
    })
  })

  it('where', async () => {
    const expectTitle = 'aaa'
    const query = firestoreEx.collectionGroup<TestDoc>({ collectionId })
    const docs = await query.where('title', '==', 'aaa').fetch()

    expect(docs.length).toBe(1)
    expect(docs[0].title).toBe(expectTitle)
  })
})

describe('collectionGroup - use timestamp', () => {
  const firestoreEx = new FirestoreEx(db, {
    timestampToDate: util.options.timestampToDate,
  })

  interface TestDoc extends TestTimestampEntity {
    title: string
  }

  beforeEach(async () => {
    const timestamp = {
      createdAt: Timestamp.fromDate(new Date(2020, 0, 1)),
      updatedAt: Timestamp.fromDate(new Date(2020, 0, 2)),
    }
    await db.collection(`${collectionPath}/1/${collectionId}`).add({ title: expectTitles[0], ...timestamp })
    await db.collection(`${collectionPath}/1/${collectionId}`).add({ title: expectTitles[1], ...timestamp })
    await db.collection(`${collectionPath}/2/${collectionId}`).add({ title: expectTitles[2], ...timestamp })
    await db.collection(`${collectionPath}/3/${collectionId}`).add({ title: expectTitles[3], ...timestamp })
  })

  afterEach(async () => {
    await deleteCollection(db, `${collectionPath}/1/${collectionId}`)
    await deleteCollection(db, `${collectionPath}/2/${collectionId}`)
    await deleteCollection(db, `${collectionPath}/3/${collectionId}`)
  })

  it('fetch', async () => {
    const query = firestoreEx.collectionGroup<TestDoc>({ collectionId, useTimestamp: true })
    const docs = await query.fetch()

    expect(docs.length).toBe(4)
    docs.sort((a, b) => {
      return a.title < b.title ? -1 : a.title > b.title ? 1 : 0
    })
    docs.forEach((doc, i) => {
      expect(doc.title).toBe(expectTitles[i])
      expect(doc.createdAt).toEqual(dayjs('2020-01-01'))
      expect(doc.updatedAt).toEqual(dayjs('2020-01-02'))
    })
  })

  it('where', async () => {
    const expectTitle = 'aaa'
    const query = firestoreEx.collectionGroup<TestDoc>({ collectionId, useTimestamp: true })
    const docs = await query.where('title', '==', expectTitle).fetch()

    expect(docs.length).toBe(1)
    docs.forEach((doc, i) => {
      expect(doc.title).toBe(expectTitle)
      expect(doc.createdAt).toEqual(dayjs('2020-01-01'))
      expect(doc.updatedAt).toEqual(dayjs('2020-01-02'))
    })
  })
})
