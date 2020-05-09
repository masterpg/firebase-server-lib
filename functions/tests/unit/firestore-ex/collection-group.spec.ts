import { AdminFirestoreTestUtil, deleteCollection } from './util'
import { Entity, FirestoreEx } from '../../../src/firestore-ex'

const util = new AdminFirestoreTestUtil()
const db = util.db
const collectionPath = util.collectionPath
const firestoreEx = new FirestoreEx(db)

interface TestDoc extends Entity {
  title: string
}

const expectTitles = ['aaa', 'bbb', 'ccc', 'ddd']
const collectionId = 'collection_group'

describe('collectionGroup', () => {
  beforeEach(async () => {
    await db.collection(`${collectionPath}/1/${collectionId}`).add({ title: expectTitles[0] })
    await db.collection(`${collectionPath}/1/${collectionId}`).add({ title: expectTitles[1] })
    await db.collection(`${collectionPath}/2/${collectionId}`).add({ title: expectTitles[2] })
    await db.collection(`${collectionPath}/3/${collectionId}`).add({ title: expectTitles[3] })
  })

  afterAll(async () => {
    await util.deleteApps()
  })

  afterEach(async () => {
    await deleteCollection(db, `${collectionPath}/1/${collectionId}`)
    await deleteCollection(db, `${collectionPath}/2/${collectionId}`)
    await deleteCollection(db, `${collectionPath}/3/${collectionId}`)
  })

  it('fetch', async () => {
    const query = firestoreEx.collectionGroup<TestDoc>({ collectionId })
    const docs = await query.fetch()

    const actualTitles = docs.map(doc => doc.title).sort()
    expect(actualTitles).toEqual(expectTitles)
  })

  it('where', async () => {
    const expectTitle = 'aaa'
    const query = firestoreEx.collectionGroup<TestDoc>({ collectionId })
    const docs = await query.where('title', '==', 'aaa').fetch()

    const actualTitles = docs.map(doc => doc.title)
    expect(actualTitles).toEqual([expectTitle])
  })
})
