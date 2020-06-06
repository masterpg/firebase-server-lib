import { Collection, DecodeFunc, EncodeFunc, EncodedObject, Entity, FirestoreEx, Timestamp } from '../../../src/firestore-ex'
import { AdminFirestoreTestUtil } from './util'
import { Dayjs } from 'dayjs'
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

afterAll(async () => {
  await util.deleteApps()
})

describe('Factory and SubCollection', () => {
  afterEach(async () => {
    await util.deleteCollection()
  })

  const encode: EncodeFunc<Book, BookDoc> = obj => {
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

  const decode: DecodeFunc<Book, BookDoc> = doc => {
    return {
      title: doc.title,
      publishedAt: dayjs(doc.published_at.toDate()),
    }
  }

  describe('FirestoreEx.collectionFactory', () => {
    it('should has same encode function', async () => {
      const factory = firestoreEx.collectionFactory<Book, BookDoc>({ encode })

      expect(factory.encode).toBe(encode)
    })

    it('should has same decode function', async () => {
      const factory = firestoreEx.collectionFactory<Book, BookDoc>({ decode })

      expect(factory.decode).toBe(decode)
    })
  })

  describe('FirestoreSimpleCollectionFactory.create', () => {
    const subcollectionPath = `${collectionPath}/test1/sub`
    const factory = firestoreEx.collectionFactory<Book, BookDoc>({ encode, decode })
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
      expect(fetchedBook).toEqual(setBook)
    })
  })
})
