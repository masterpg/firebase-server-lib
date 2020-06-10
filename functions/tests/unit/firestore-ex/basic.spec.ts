import {
  EncodedObject,
  Entity,
  EntityAddInput,
  EntitySetInput,
  EntityUpdateInput,
  FieldValue,
  FirestoreEx,
  Timestamp,
  TimestampEntity,
} from '../../../src/firestore-ex'
import { AdminFirestoreTestUtil } from './util'
import dayjs = require('dayjs')
import { Dayjs } from 'dayjs'

const util = new AdminFirestoreTestUtil()
const db = util.db
const collectionPath = util.collectionPath

afterAll(async () => {
  await util.deleteApps()
})

describe('Basic', () => {
  const firestoreEx = new FirestoreEx(db)

  interface TestDoc extends Entity {
    title: string
    num: number
  }

  const dao = firestoreEx.collection<TestDoc>({ path: collectionPath })
  const existsDocId = 'test'
  const existsDoc = {
    title: 'title',
    num: 10,
  }

  // Add fix id document and random id document
  beforeEach(async () => {
    await dao.collectionRef.doc(existsDocId).set(existsDoc)
    await dao.collectionRef.add({
      title: 'before',
      num: 10,
    })
  })

  afterEach(async () => {
    await util.deleteCollection()
  })

  describe('fetch', () => {
    it('exists document', async () => {
      const doc = (await dao.fetch(existsDocId))!

      expect(doc).toEqual({ id: existsDocId, ...existsDoc })
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
    const doc: EntityAddInput<TestDoc> = {
      title: 'add',
      num: 10,
    }
    const docId = await dao.add(doc)

    const fetchedDoc = (await dao.fetch(docId))!
    expect(fetchedDoc).toEqual({
      id: expect.anything(),
      title: doc.title,
      num: doc.num,
    })
  })

  it('set', async () => {
    // add
    const docId = await dao.add({
      title: 'hogehoge',
      num: 10,
    })
    const addedDoc = (await dao.fetch(docId))!

    // set
    const setDoc: EntitySetInput<TestDoc> = {
      id: docId,
      title: 'set',
      num: 20,
    }
    const setId = await dao.set(setDoc)

    // fetch
    const fetchedDoc = (await dao.fetch(setId))!
    expect(fetchedDoc).toEqual(setDoc)
  })

  describe('update', () => {
    it('with simple value', async () => {
      // add
      const docId = await dao.add({
        title: 'hogehoge',
        num: 10,
      })
      const addedDoc = (await dao.fetch(docId))!

      // update
      const updatedDoc: EntityUpdateInput<TestDoc> = {
        id: docId,
        title: 'update',
      }
      const updatedId = await dao.update(updatedDoc)
      expect(updatedId).toEqual(docId)

      // fetch
      const fetchedDoc = (await dao.fetch(updatedId))!
      expect(fetchedDoc.title).toEqual(updatedDoc.title)
    })

    it('with FieldValue.increment', async () => {
      // add
      const baseNum = 10
      const docId = await dao.add({
        title: 'FieldValue_increment',
        num: baseNum,
      })

      // update
      const incrementNum = 100
      const updatedId = await dao.update({
        id: docId,
        num: FieldValue.increment(incrementNum),
      })

      // fetch
      const fetchedDoc = (await dao.fetch(updatedId))!
      expect(fetchedDoc.num).toEqual(baseNum + incrementNum)
    })
  })

  it('delete', async () => {
    // add
    const doc = {
      title: 'delete',
      num: 10,
    }
    const docId = await dao.add(doc)

    // delete
    await dao.delete(docId)
    const snap = await dao.fetch(docId)

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
})

describe('Basic - use timestamp', () => {
  const firestoreEx = new FirestoreEx(db)

  interface TestDoc extends TimestampEntity {
    title: string
    num: number
  }

  const dao = firestoreEx.collection<TestDoc>({ path: collectionPath, useTimestamp: true })
  const existsDocId = 'test'
  const existsDoc = {
    title: 'title',
    num: 10,
  }

  // Add fix id document and random id document
  beforeEach(async () => {
    await dao.collectionRef.doc(existsDocId).set({
      ...existsDoc,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    await dao.collectionRef.add({
      title: 'before',
      num: 10,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  })

  afterEach(async () => {
    await util.deleteCollection()
  })

  it('fetch', async () => {
    const doc = (await dao.fetch(existsDocId))!

    expect(doc).toMatchObject({ id: existsDocId, ...existsDoc })
    expect(doc.createdAt.isValid()).toBeTruthy()
    expect(doc.updatedAt.isValid()).toBeTruthy()
  })

  it('add', async () => {
    // add
    const doc: EntityAddInput<TestDoc> = {
      title: 'add',
      num: 10,
    }
    const docId = await dao.add(doc)

    // fetch
    const fetchedDoc = (await dao.fetch(docId))!
    expect(fetchedDoc).toMatchObject({
      id: expect.anything(),
      title: doc.title,
      num: doc.num,
    })
    expect(fetchedDoc.createdAt.isValid()).toBeTruthy()
    expect(fetchedDoc.updatedAt.isValid()).toBeTruthy()
  })

  describe('set', () => {
    it('set as add', async () => {
      // set as add
      const setDoc = {
        id: dao.docRef().id,
        title: 'set',
        num: 10,
      }
      const setId = await dao.set(setDoc)

      // fetch
      const fetchedDoc = (await dao.fetch(setId))!
      expect(fetchedDoc).toMatchObject(setDoc)
      expect(fetchedDoc.createdAt.isValid()).toBeTruthy()
      expect(fetchedDoc.updatedAt.isValid()).toBeTruthy()
    })

    it('set as update', async () => {
      // add
      const docId = await dao.add({
        title: 'hogehoge',
        num: 10,
      })
      const addedDoc = (await dao.fetch(docId))!

      // set as update
      const setDoc: EntitySetInput<TestDoc> = {
        id: addedDoc.id,
        title: 'set',
        num: 20,
        createdAt: addedDoc.createdAt,
      }
      const setId = await dao.set(setDoc)

      // fetch
      const fetchedDoc = (await dao.fetch(setId))!
      expect(fetchedDoc).toMatchObject(setDoc)
      expect(fetchedDoc.createdAt).toEqual(addedDoc.createdAt)
      expect(fetchedDoc.updatedAt.isAfter(addedDoc.updatedAt)).toBeTruthy()
    })
  })

  it('update', async () => {
    // add
    const docId = await dao.add({
      title: 'hogehoge',
      num: 10,
    })
    const addedDoc = (await dao.fetch(docId))!

    // update
    const updatedDoc: EntityUpdateInput<TestDoc> = {
      id: addedDoc.id,
      title: 'update',
    }
    const updatedId = await dao.update(updatedDoc)
    expect(updatedId).toEqual(addedDoc.id)

    // fetch
    const fetchedDoc = (await dao.fetch(updatedId))!
    expect(fetchedDoc.title).toEqual(updatedDoc.title)
    expect(fetchedDoc.createdAt).toEqual(addedDoc.createdAt)
    expect(fetchedDoc.updatedAt.isAfter(addedDoc.updatedAt)).toBeTruthy()
  })

  describe('set the timestamp manually', () => {
    const dao = firestoreEx.collection<TestDoc>({
      path: collectionPath,
      encode: obj => {
        const result: EncodedObject<TestDoc> = {}
        if (obj.title) result.title = obj.title
        if (typeof obj.num === 'number') result.num = obj.num
        if (dayjs.isDayjs(obj.createdAt)) {
          result.createdAt = Timestamp.fromDate((obj.createdAt as Dayjs).toDate())
        } else {
          result.createdAt = FieldValue.serverTimestamp()
        }
        result.updatedAt = FieldValue.serverTimestamp()
        return result
      },
      decode: doc => {
        return {
          ...doc,
          createdAt: dayjs(doc.createdAt!.toDate()),
          updatedAt: dayjs(doc.updatedAt!.toDate()),
        }
      },
    })

    it('add', async () => {
      // add
      const doc: EntityAddInput<TestDoc> = {
        title: 'add',
        num: 10,
      }
      const docId = await dao.add(doc)

      // fetch
      const fetchedDoc = (await dao.fetch(docId))!
      expect(fetchedDoc).toMatchObject({
        id: expect.anything(),
        title: doc.title,
        num: doc.num,
      })
      expect(dayjs.isDayjs(fetchedDoc.createdAt)).toBeTruthy()
      expect(dayjs.isDayjs(fetchedDoc.updatedAt)).toBeTruthy()
    })

    it('update', async () => {
      // add
      const docId = await dao.add({
        title: 'hogehoge',
        num: 10,
      })
      const addedDoc = (await dao.fetch(docId))!

      // update
      const updatedDoc: EntityUpdateInput<TestDoc> = {
        id: addedDoc.id,
        title: 'update',
        createdAt: addedDoc.createdAt,
      }
      const updatedId = await dao.update(updatedDoc)
      expect(updatedId).toEqual(addedDoc.id)

      // fetch
      const fetchedDoc = (await dao.fetch(updatedId))!
      expect(fetchedDoc.title).toEqual(updatedDoc.title)
      expect(fetchedDoc.createdAt).toEqual(addedDoc.createdAt)
      expect(fetchedDoc.updatedAt.isAfter(addedDoc.updatedAt)).toBeTruthy()
    })
  })
})
