import { Entity, FirestoreEx } from '../../../src/firestore-ex'
import { AdminFirestoreTestUtil } from './util'
import { Timestamp } from '@google-cloud/firestore'

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

class BookClass {
  constructor(public id: string, public bookTitle: string) {}
}

describe('encode', () => {
  afterAll(async () => {
    await util.deleteApps()
  })

  afterEach(async () => {
    await util.deleteCollection()
  })

  describe('from object with different key', () => {
    const dao = firestoreEx.collection<Book, BookDoc>({
      path: collectionPath,
      encode: book => {
        return {
          book_title: book.bookTitle,
        }
      },
    })

    it('add with encode', async () => {
      const title = 'add'
      const doc = {
        bookTitle: title,
      }
      const addedId = await dao.add(doc)

      const fetchedSnap = await dao.collectionRef.doc(addedId).get()
      const fetchedDoc = fetchedSnap.data()!
      expect(fetchedDoc).toMatchObject({ book_title: title })
      expect(fetchedDoc.createdAt).toBeInstanceOf(Timestamp)
      expect(fetchedDoc.updatedAt).toBeInstanceOf(Timestamp)
    })

    it('set with encode', async () => {
      const existsDoc = await dao.collectionRef.add({
        book_title: 'hogehoge',
      })
      const title = 'set'
      const setDoc = {
        id: existsDoc.id,
        bookTitle: title,
      }
      await dao.set(setDoc)

      const fetchedSnap = await dao.collectionRef.doc(existsDoc.id).get()
      const fetchedDoc = fetchedSnap.data()!
      expect(fetchedDoc).toMatchObject({ book_title: title })
      expect(fetchedDoc.createdAt).toBeInstanceOf(Timestamp)
      expect(fetchedDoc.updatedAt).toBeInstanceOf(Timestamp)
    })
  })

  describe('from class instance with same key', () => {
    const dao = firestoreEx.collection<Book>({
      path: collectionPath,
      encode: book => {
        return {
          bookTitle: book.bookTitle,
        }
      },
    })

    it('set with encode', async () => {
      const existsDoc = await dao.collectionRef.add({
        bookTitle: 'hogehoge',
      })
      const title = 'set'
      const setDoc = new BookClass(existsDoc.id, title)
      await dao.set(setDoc)

      const fetchedSnap = await dao.collectionRef.doc(existsDoc.id).get()
      const fetchedDoc = fetchedSnap.data()!
      expect(fetchedDoc).toMatchObject({ bookTitle: title })
      expect(fetchedDoc.createdAt).toBeInstanceOf(Timestamp)
      expect(fetchedDoc.updatedAt).toBeInstanceOf(Timestamp)
    })
  })
})
