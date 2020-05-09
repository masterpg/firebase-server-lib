import { Collection, DecodeFunc, EncodeFunc, EncodedObject, Entity, FirestoreEx } from '../../../src/firestore-ex'
import { AdminFirestoreTestUtil } from './util'
import { Dayjs } from 'dayjs'
import { Timestamp } from '@google-cloud/firestore'
import dayjs = require('dayjs')

const util = new AdminFirestoreTestUtil()
const db = util.db
const collectionPath = util.collectionPath
const firestoreEx = new FirestoreEx(db)

interface Book extends Entity {
  title: string
  publishedAt: Dayjs
}

interface BookDoc {
  title: string
  published_at: Timestamp
}

describe('Factory and SubCollection', () => {
  afterAll(async () => {
    await util.deleteApps()
  })

  afterEach(async () => {
    await util.deleteCollection()
  })

  const encodeFunc: EncodeFunc<Book, BookDoc> = obj => {
    const result: EncodedObject<BookDoc> = {}
    if (typeof obj.title === 'string') {
      result.title = obj.title
    }
    if (obj.publishedAt) {
      const date = (obj.publishedAt as Dayjs).toDate()
      result.published_at = Timestamp.fromDate(date)
    }
    return result
  }

  const decodeFunc: DecodeFunc<Book, BookDoc> = doc => {
    return {
      title: doc.title,
      publishedAt: dayjs(doc.published_at.toDate()),
    }
  }

  describe('FirestoreEx.collectionFactory', () => {
    it('should has same encode function', async () => {
      const factory = firestoreEx.collectionFactory<Book, BookDoc>({
        encode: encodeFunc,
      })

      expect(factory.encode).toBe(encodeFunc)
    })

    it('should has same decode function', async () => {
      const factory = firestoreEx.collectionFactory<Book, BookDoc>({
        decode: decodeFunc,
      })

      expect(factory.decode).toBe(decodeFunc)
    })
  })

  describe('FirestoreSimpleCollectionFactory.create', () => {
    const subcollectionPath = `${collectionPath}/test1/sub`
    const factory = firestoreEx.collectionFactory<Book, BookDoc>({
      encode: encodeFunc,
      decode: decodeFunc,
    })
    let dao: Collection<Book, BookDoc>

    beforeEach(async () => {
      dao = factory.create(subcollectionPath)
    })

    it('should be same collection path', async () => {
      expect(dao.collectionRef.path).toEqual(subcollectionPath)
    })

    it('should has same context', async () => {
      expect(dao.context).toBe(firestoreEx.context)
    })

    it('set with encode/decode by created dao', async () => {
      const now = dayjs()
      const doc = {
        title: 'exists_book',
        published_at: Timestamp.fromDate(now.toDate()),
      }
      const docRef = await dao.collectionRef.add(doc)

      const title = 'set'
      const setBook = {
        id: docRef.id,
        title: title,
        publishedAt: dayjs(doc.published_at.toDate()),
      }
      await dao.set(setBook)

      const fetchedBook = (await dao.fetch(setBook.id))!
      expect(fetchedBook).toMatchObject(setBook)
      expect(fetchedBook.createdAt.isValid()).toBeTruthy()
      expect(fetchedBook.updatedAt.isValid()).toBeTruthy()
    })
  })
})
