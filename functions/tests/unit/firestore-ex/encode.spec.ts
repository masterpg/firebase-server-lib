import { EncodeFunc, Entity, FirestoreEx } from '../../../src/firestore-ex'
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

describe('encode', () => {
  const now = dayjs()

  afterAll(async () => {
    await util.deleteApps()
  })

  afterEach(async () => {
    await util.deleteCollection()
  })

  function toDayjs(value: Timestamp): Dayjs {
    expect(value).toBeInstanceOf(Timestamp)
    return dayjs(value.toDate())
  }

  describe('from object', () => {
    const encode: EncodeFunc<Book> = book => {
      return {
        book_title: book.bookTitle,
      }
    }

    it('with encode', async () => {
      // with encode
      const dao = firestoreEx.collection<Book, BookDoc>({ path: collectionPath, encode })

      // add
      const doc = {
        bookTitle: 'hogehoge',
        // It's a meaningless setting, but to verify that it doesn't cause any problems.
        createdAt: now,
        updatedAt: now,
      }
      const docId = await dao.add(doc)

      const fetchedSnap = await dao.collectionRef.doc(docId).get()
      const fetchedDoc = fetchedSnap.data()!
      expect(fetchedDoc).toMatchObject({ book_title: doc.bookTitle })
      expect(toDayjs(fetchedDoc.createdAt).isAfter(now)).toBeTruthy()
      expect(toDayjs(fetchedDoc.updatedAt).isAfter(now)).toBeTruthy()
    })

    it('without encode', async () => {
      // without encode
      const dao = firestoreEx.collection<Book>({ path: collectionPath })

      // add
      const docId = await dao.add({
        bookTitle: 'hogehoge',
      })
      const doc = (await dao.fetch(docId))!

      // update
      const updatedDoc = {
        id: docId,
        bookTitle: 'update',
        // It's a meaningless setting, but to verify that it doesn't cause any problems.
        createdAt: now,
        updatedAt: now,
      }
      await dao.update(updatedDoc)

      const fetchedSnap = await dao.collectionRef.doc(docId).get()
      const fetchedDoc = fetchedSnap.data()!
      expect(fetchedDoc).toMatchObject({ bookTitle: updatedDoc.bookTitle })
      expect(toDayjs(fetchedDoc.createdAt)).toEqual(doc.createdAt)
      expect(toDayjs(fetchedDoc.updatedAt).isAfter(doc.updatedAt)).toBeTruthy()
    })
  })

  describe('from class', () => {
    class BookClass {
      constructor(params: { id?: string; bookTitle: string; createdAt: Dayjs; updatedAt: Dayjs }) {
        this.id = params.id
        this.bookTitle = params.bookTitle
        this.createdAt = params.createdAt
        this.updatedAt = params.updatedAt
      }
      public readonly id?: string
      public bookTitle: string
      public readonly createdAt: Dayjs
      public readonly updatedAt: Dayjs
    }

    const encode: EncodeFunc<Book> = book => {
      return {
        bookTitle: book.bookTitle,
      }
    }

    it('with encode', async () => {
      // with encode
      const dao = firestoreEx.collection<Book>({ path: collectionPath, encode })

      // add
      const doc = new BookClass({
        bookTitle: 'hogehoge',
        // It's a meaningless setting, but to verify that it doesn't cause any problems.
        createdAt: now,
        updatedAt: now,
      })
      const docId = await dao.add(doc)

      const fetchedSnap = await dao.collectionRef.doc(docId).get()
      const fetchedDoc = fetchedSnap.data()!
      expect(fetchedDoc).toMatchObject({ bookTitle: doc.bookTitle })
      expect(toDayjs(fetchedDoc.createdAt).isAfter(now)).toBeTruthy()
      expect(toDayjs(fetchedDoc.updatedAt).isAfter(now)).toBeTruthy()
    })

    it('without encode', async () => {
      // without encode
      const dao = firestoreEx.collection<Book>({ path: collectionPath })

      // add
      const docId = await dao.add({
        bookTitle: 'hogehoge',
      })
      const doc = (await dao.fetch(docId))!

      // update
      const updatedDoc = new BookClass({
        id: docId,
        bookTitle: 'update',
        // It's a meaningless setting, but to verify that it doesn't cause any problems.
        createdAt: now,
        updatedAt: now,
      }) as Book
      await dao.update(updatedDoc)

      const fetchedSnap = await dao.collectionRef.doc(docId).get()
      const fetchedDoc = fetchedSnap.data()!
      expect(fetchedDoc).toMatchObject({ bookTitle: updatedDoc.bookTitle })
      expect(toDayjs(fetchedDoc.createdAt)).toEqual(doc.createdAt)
      expect(toDayjs(fetchedDoc.updatedAt).isAfter(now)).toBeTruthy()
    })

    describe('from class is in error', () => {
      class BookClassWithFunc extends BookClass {
        // This field type cannot contain be store in Firestore
        anyFunc = () => {}
      }

      it('add without encode is in error', async () => {
        // without encode
        const dao = firestoreEx.collection<Book>({
          path: collectionPath,
        })

        // add
        const title = 'set'
        const doc = new BookClassWithFunc({
          bookTitle: 'update',
          // It's a meaningless setting, but to verify that it doesn't cause any problems.
          createdAt: now,
          updatedAt: now,
        })
        // The 'anyFunc' filed cannot be stored in Firestore, so it's a error.
        expect(dao.add(doc)).rejects.toThrow('Cannot encode value: () => { }')
      })
    })
  })
})
