import { Entity, FirestoreEx } from '../../../src/firestore-ex'
import { AdminFirestoreTestUtil } from './util'
import { Dayjs } from 'dayjs'
import { Timestamp } from '@google-cloud/firestore'
import dayjs = require('dayjs')

const util = new AdminFirestoreTestUtil()
const db = util.db
const collectionPath = util.collectionPath
const firestoreEx = new FirestoreEx(db)

interface Book extends Entity {
  bookTitle: string
}

interface BookDoc {
  book_title: string
}

class BookClass implements Entity {
  constructor(public readonly id: string, public bookTitle: string, createdAt: Timestamp, updatedAt: Timestamp) {
    this.createdAt = dayjs(createdAt.toDate())
    this.updatedAt = dayjs(updatedAt.toDate())
  }
  readonly createdAt: Dayjs
  readonly updatedAt: Dayjs
}

describe('decode', () => {
  afterAll(async () => {
    await util.deleteApps()
  })

  afterEach(async () => {
    await util.deleteCollection()
  })

  describe('to object with different key', () => {
    const dao = firestoreEx.collection<Book, BookDoc>({
      path: collectionPath,
      decode: doc => {
        return {
          bookTitle: doc.book_title,
        }
      },
    })

    it('fetch with decode', async () => {
      const title = 'add1'
      const docRef = await dao.collectionRef.add({
        book_title: title,
        createdAt: Timestamp.fromDate(new Date(2020, 0, 1)),
        updatedAt: Timestamp.fromDate(new Date(2020, 0, 2)),
      })

      const fetchedDoc = (await dao.fetch(docRef.id))!
      expect(fetchedDoc).toEqual({
        id: docRef.id,
        bookTitle: title,
        createdAt: dayjs('2020-01-01'),
        updatedAt: dayjs('2020-01-02'),
      })
    })

    it('where with decode', async () => {
      const title = 'add2'
      const docRef = await dao.collectionRef.add({
        book_title: title,
        createdAt: Timestamp.fromDate(new Date(2020, 0, 1)),
        updatedAt: Timestamp.fromDate(new Date(2020, 0, 2)),
      })

      const fetchedDoc = await dao.where('book_title', '==', title).fetch()
      expect(fetchedDoc).toEqual([
        {
          id: docRef.id,
          bookTitle: title,
          createdAt: dayjs('2020-01-01'),
          updatedAt: dayjs('2020-01-02'),
        },
      ])
    })
  })

  describe('to class instance with same key', () => {
    const dao = firestoreEx.collection<BookClass>({
      path: collectionPath,
      decode: doc => {
        return new BookClass(doc.id, doc.bookTitle, doc.createdAt, doc.updatedAt)
      },
    })

    it('fetch with decode', async () => {
      const bookTitle = 'add1'
      const createdAt = Timestamp.fromDate(new Date(2020, 0, 1))
      const updatedAt = Timestamp.fromDate(new Date(2020, 0, 2))
      const docRef = await dao.collectionRef.add({ bookTitle, createdAt, updatedAt })

      const fetchedDoc = await dao.fetch(docRef.id)
      expect(fetchedDoc).toEqual(new BookClass(docRef.id, bookTitle, createdAt, updatedAt))
    })
  })
})
