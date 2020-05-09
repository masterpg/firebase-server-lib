import { EncodedObject, Entity, FirestoreEx } from '../../../src/firestore-ex'
import { FieldValue, Timestamp } from '@google-cloud/firestore'
import { AdminFirestoreTestUtil } from './util'
import { Dayjs } from 'dayjs'
import dayjs = require('dayjs')

const util = new AdminFirestoreTestUtil()
const db = util.db
const collectionPath = util.collectionPath
const firestoreEx = new FirestoreEx(db)

interface Book extends Entity {
  bookTitle: string
  publishedAt: Dayjs
  stocks: number
  description?: string
}

interface BookDoc {
  book_title: string
  publishedAt: Timestamp
  stocks: number
  description?: string
}

describe('encode and decode', () => {
  const dao = firestoreEx.collection<Book, BookDoc>({
    path: collectionPath,
    encode: book => {
      const result: EncodedObject<BookDoc> = {}
      if (typeof book.bookTitle === 'string') {
        result.book_title = book.bookTitle
      }
      if (book.publishedAt) {
        const date = (book.publishedAt as Dayjs).toDate()
        result.publishedAt = Timestamp.fromDate(date)
      }
      if (typeof book.stocks !== 'undefined') {
        result.stocks = book.stocks
      }
      if (typeof book.description === 'string') {
        result.description = book.description
      }
      return result
    },
    decode: doc => {
      return {
        id: doc.id,
        bookTitle: doc.book_title,
        publishedAt: dayjs(doc.publishedAt.toDate()), // Firestore timestamp to JS Date
        stocks: doc.stocks as number,
        description: doc.description,
      }
    },
  })
  const now = dayjs()

  afterAll(async () => {
    await util.deleteApps()
  })

  afterEach(async () => {
    await util.deleteCollection()
  })

  it('add with encode/decode', async () => {
    const doc = {
      bookTitle: 'add',
      publishedAt: now,
      stocks: 10,
    }
    const addedBookId = await dao.add(doc)

    const fetchedBook = (await dao.fetch(addedBookId))!
    expect(fetchedBook).toMatchObject({
      id: addedBookId,
      bookTitle: doc.bookTitle,
      publishedAt: doc.publishedAt,
      stocks: doc.stocks,
    })
    expect(fetchedBook.createdAt.isValid()).toBeTruthy()
    expect(fetchedBook.updatedAt.isValid()).toBeTruthy()
  })

  it('set with encode/decode', async () => {
    const doc = {
      id: 'test1',
      bookTitle: 'set',
      publishedAt: now,
      stocks: 10,
    }
    const setBookId = await dao.set(doc)

    const fetchedBook = (await dao.fetch(setBookId))!
    expect(fetchedBook).toMatchObject({
      id: setBookId,
      bookTitle: doc.bookTitle,
      publishedAt: doc.publishedAt,
      stocks: doc.stocks,
    })
    expect(fetchedBook.createdAt.isValid()).toBeTruthy()
    expect(fetchedBook.updatedAt.isValid()).toBeTruthy()
  })

  it('update with encode/decode', async () => {
    const baseStocks = 10
    const bookId = await dao.add({
      bookTitle: 'add',
      publishedAt: now,
      stocks: baseStocks,
    })
    const addedBook = (await dao.fetch(bookId))!

    const updatedTitle = 'update'
    const incrementalStocks = 5
    const updatedDescription = 'hogehoge'
    await dao.update({
      id: bookId,
      bookTitle: updatedTitle,
      stocks: FieldValue.increment(incrementalStocks),
      description: updatedDescription,
    })

    const fetchedBook = (await dao.fetch(bookId))!
    expect(fetchedBook.bookTitle).toEqual(updatedTitle)
    expect(fetchedBook.stocks).toEqual(baseStocks + incrementalStocks)
    expect(fetchedBook.description).toEqual(updatedDescription)
    expect(fetchedBook.createdAt).toEqual(addedBook.createdAt)
    expect(fetchedBook.updatedAt.isAfter(addedBook.updatedAt)).toBeTruthy()
  })
})
