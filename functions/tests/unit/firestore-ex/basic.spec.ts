import { Entity, FirestoreEx } from '../../../src/firestore-ex'
import { AdminFirestoreTestUtil } from './util'
import { FieldValue } from '@google-cloud/firestore'

const util = new AdminFirestoreTestUtil()
const db = util.db
const collectionPath = util.collectionPath
const firestoreEx = new FirestoreEx(db)

interface TestDoc extends Entity {
  title: string
  num: number
}

describe('Basic', () => {
  const dao = firestoreEx.collection<TestDoc>({ path: collectionPath })
  const existsDocId = 'test'
  const existsDoc = {
    title: 'title',
    num: 10,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }

  // Add fix id document and random id document
  beforeEach(async () => {
    await dao.collectionRef.doc(existsDocId).set(existsDoc)
    await dao.collectionRef.add({
      title: 'before',
      num: 10,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  })

  afterAll(async () => {
    await util.deleteApps()
  })

  afterEach(async () => {
    await util.deleteCollection()
  })

  describe('fetch', () => {
    it('exists document', async () => {
      const doc = (await dao.fetch(existsDocId))!
      const expectDoc = { ...existsDoc, id: existsDocId }

      expect(doc).toMatchObject(expectDoc)
      expect(doc.createdAt.isValid()).toBeTruthy()
      expect(doc.updatedAt.isValid()).toBeTruthy()
    })

    it('does not exist document', async () => {
      const doc = await dao.fetch('not_exists_document_id')

      expect(doc).toEqual(undefined)
    })

    it('fetchAll', async () => {
      const docs = await dao.fetchAll()

      expect(docs.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('add', async () => {
    const doc = {
      title: 'add',
      num: 10,
    }

    const addedId = await dao.add(doc)

    const fetchedDoc = (await dao.fetch(addedId))!
    expect(fetchedDoc).toMatchObject({
      id: expect.anything(),
      title: doc.title,
      num: doc.num,
    })
    expect(fetchedDoc.createdAt.isValid()).toBeTruthy()
    expect(fetchedDoc.updatedAt.isValid()).toBeTruthy()
  })

  it('set', async () => {
    const addedId = await dao.add({
      title: 'hogehoge',
      num: 10,
    })
    const addedDoc = (await dao.fetch(addedId))!
    const setDoc = {
      id: addedDoc.id,
      title: 'set',
      num: 20,
    }

    const setId = await dao.set(setDoc)

    const fetchedDoc = (await dao.fetch(setId))!
    expect(fetchedDoc).toMatchObject(setDoc)
    expect(fetchedDoc.createdAt.isAfter(addedDoc.createdAt)).toBeTruthy()
    expect(fetchedDoc.updatedAt.isValid()).toBeTruthy()
  })

  it('delete', async () => {
    const doc = {
      title: 'delete',
      num: 10,
    }
    const addedId = await dao.add(doc)

    await dao.delete(addedId)
    const snap = await dao.fetch(addedId)

    expect(snap).toBeUndefined()
  })

  describe('docRef', () => {
    it('with no argument should return new document ref', async () => {
      const docRef = dao.docRef()

      const fetchedDoc = await dao.fetch(docRef.id)
      expect(fetchedDoc).toBeUndefined()
    })

    it('with id argument should return exists document ref', async () => {
      const docRef = dao.docRef(existsDocId)

      const fetchedDoc = await dao.fetch(docRef.id)
      expect(fetchedDoc).toBeDefined()
    })
  })

  describe('update', () => {
    it('with simple value', async () => {
      const addedId = await dao.add({
        title: 'hogehoge',
        num: 10,
      })
      const addedDoc = (await dao.fetch(addedId))!

      const expectTitle = 'update'
      const updatedId = await dao.update({
        id: addedDoc.id,
        title: expectTitle,
      })

      expect(updatedId).toEqual(addedDoc.id)

      const fetchedDoc = (await dao.fetch(updatedId))!
      expect(fetchedDoc.title).toEqual(expectTitle)
      expect(fetchedDoc.createdAt).toEqual(addedDoc.createdAt)
      expect(fetchedDoc.updatedAt.isAfter(addedDoc.updatedAt)).toBeTruthy()
    })

    it('with FieldValue.increment', async () => {
      const baseNum = 10
      const addedId = await dao.add({
        title: 'FieldValue_increment',
        num: baseNum,
      })

      const incrementNum = 100
      const updatedId = await dao.update({
        id: addedId,
        num: FieldValue.increment(incrementNum),
      })

      const fetchedDoc = (await dao.fetch(updatedId))!
      expect(fetchedDoc.num).toEqual(baseNum + incrementNum)
    })
  })
})
