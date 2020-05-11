import { DecodeFunc, Entity, FirestoreEx } from '../../../src/firestore-ex'
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

describe('decode', () => {
  afterAll(async () => {
    await util.deleteApps()
  })

  afterEach(async () => {
    await util.deleteCollection()
  })

  describe('to object', () => {
    const decode: DecodeFunc<Book, BookDoc> = doc => {
      return {
        bookTitle: doc.book_title,
      }
    }

    it('fetch with decode', async () => {
      // with decode
      const dao = firestoreEx.collection<Book, BookDoc>({ path: collectionPath, decode })

      // add
      const title = 'add'
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

    it('fetch without decode', async () => {
      // without decode
      const dao = firestoreEx.collection<Book>({ path: collectionPath })

      // add
      const title = 'add'
      const docRef = await dao.collectionRef.add({
        bookTitle: title,
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
      // with decode
      const dao = firestoreEx.collection<Book, BookDoc>({ path: collectionPath, decode })

      // add
      const title = 'add'
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

  describe('to class', () => {
    class BookClass {
      constructor(params: { id?: string; bookTitle: string; createdAt?: Dayjs; updatedAt?: Dayjs }) {
        this.id = params.id
        this.bookTitle = params.bookTitle
        this.createdAt = params.createdAt
        this.updatedAt = params.updatedAt
      }
      public readonly id?: string
      public bookTitle: string
      public readonly createdAt?: Dayjs
      public readonly updatedAt?: Dayjs
    }

    const decodeA: DecodeFunc<Book, BookDoc> = doc => {
      return new BookClass({
        bookTitle: doc.book_title,
      })
    }

    const decodeB: DecodeFunc<Book, BookDoc> = doc => {
      return new BookClass({
        id: doc.id,
        bookTitle: doc.book_title,
        createdAt: dayjs(doc.createdAt.toDate()),
        updatedAt: dayjs(doc.updatedAt.toDate()),
      })
    }

    it(`fetch with decode - don't process entity fields in decode function`, async () => {
      // with decodeA
      const dao = firestoreEx.collection<Book, BookDoc>({ path: collectionPath, decode: decodeA })

      // add
      const bookTitle = 'add'
      const createdAt = Timestamp.fromDate(new Date(2020, 0, 1))
      const updatedAt = Timestamp.fromDate(new Date(2020, 0, 2))
      const docRef = await dao.collectionRef.add({ book_title: bookTitle, createdAt, updatedAt })

      const fetchedDoc = await dao.fetch(docRef.id)
      expect(fetchedDoc).toEqual(
        new BookClass({
          id: docRef.id,
          bookTitle,
          createdAt: dayjs(createdAt.toDate()),
          updatedAt: dayjs(updatedAt.toDate()),
        })
      )
    })

    it('fetch with decode - process entity fields in decode function', async () => {
      // with decodeB
      const dao = firestoreEx.collection<Book, BookDoc>({ path: collectionPath, decode: decodeB })

      // add
      const bookTitle = 'add'
      const createdAt = Timestamp.fromDate(new Date(2020, 0, 1))
      const updatedAt = Timestamp.fromDate(new Date(2020, 0, 2))
      const docRef = await dao.collectionRef.add({ book_title: bookTitle, createdAt, updatedAt })

      const fetchedDoc = await dao.fetch(docRef.id)
      expect(fetchedDoc).toEqual(
        new BookClass({
          id: docRef.id,
          bookTitle,
          createdAt: dayjs(createdAt.toDate()),
          updatedAt: dayjs(updatedAt.toDate()),
        })
      )
    })
  })
})
