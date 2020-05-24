import { EncodedObject, Entity, FirestoreEx } from '../../../src/firestore-ex'
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
  publishedAt: Dayjs
  bookId: number
}

interface BookDoc {
  book_title: string
  publishedAt: Timestamp
  book_id: number
}

afterAll(async () => {
  await util.deleteApps()
})

describe('query onSnapshot test', () => {
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
      if (typeof book.bookId === 'number') {
        result.book_id = book.bookId
      }
      return result
    },
    decode: doc => {
      return {
        id: doc.id,
        bookTitle: doc.book_title,
        publishedAt: dayjs(doc.publishedAt.toDate()),
        bookId: doc.book_id,
      }
    },
  })
  let existsDoc: Book

  beforeEach(async () => {
    const addedDoc = {
      bookTitle: 'exists',
      publishedAt: dayjs(),
      bookId: 1,
    }
    const addedId = await dao.add(addedDoc)
    existsDoc = (await dao.fetch(addedId))!
  })

  afterEach(async () => {
    await util.deleteCollection()
  })

  it('observe add change', async done => {
    const addedDoc = {
      bookTitle: 'query_add',
      publishedAt: dayjs(),
      bookId: 2,
    }

    dao.where('book_id', '==', addedDoc.bookId).onSnapshot((querySnap, toObject) => {
      querySnap.docChanges().forEach(change => {
        if (change.type === 'added') {
          const changedDoc = toObject(change.doc)
          expect(changedDoc).toEqual({
            id: expect.anything(),
            ...addedDoc,
          })
          done()
        }
      })
    })

    await new Promise(resolve => setTimeout(resolve, 1000)) // for async stability
    await dao.add(addedDoc)
  })

  it('observe update changes', async done => {
    const updatedDoc = {
      id: existsDoc.id,
      bookTitle: 'query_update',
      publishedAt: existsDoc.publishedAt,
      bookId: existsDoc.bookId,
    }

    // where('book_title', '==', doc.bookTitle) is not triggered modify event.
    // I don't know why, so book_id is hack for resolve this issue.
    // dao.where('book_title', '==', 'query_update').onSnapshot((querySnapshot, toObject) => {
    dao.where('book_id', '==', updatedDoc.bookId).onSnapshot((querySnapshot, toObject) => {
      querySnapshot.docChanges().forEach(change => {
        if (change.type === 'modified') {
          const changedDoc = toObject(change.doc)
          expect(changedDoc).toEqual(updatedDoc)
          done()
        }
      })
    })

    await new Promise(resolve => setTimeout(resolve, 1000)) // for async stability
    await dao.update({ id: updatedDoc.id, bookTitle: updatedDoc.bookTitle })
  })

  it('observe delete change', async done => {
    // dao.where('book_id', '==', existsDoc.bookId).onSnapshot((querySnapshot, toObject) => {
    dao.where('book_title', '==', existsDoc.bookTitle).onSnapshot((querySnapshot, toObject) => {
      querySnapshot.docChanges().forEach(change => {
        if (change.type === 'removed' && change.doc.data().book_title === existsDoc.bookTitle) {
          const changedDoc = toObject(change.doc)
          expect(changedDoc).toEqual(existsDoc)
          done()
        }
      })
    })

    await new Promise(resolve => setTimeout(resolve, 1000)) // for async stability
    await dao.delete(existsDoc.id)
  })
})
