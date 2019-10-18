import * as admin from 'firebase-admin'
import { Injectable } from '@nestjs/common'
import { Product } from './types'

@Injectable()
class ProductService {
  async findList(ids?: string[]): Promise<Product[]> {
    const db = admin.firestore()
    if (ids && ids.length) {
      const productMap: { [id: string]: Product } = {}
      const promises: Promise<void>[] = []
      for (const id of ids) {
        promises.push(
          (async () => {
            const doc = await db
              .collection('products')
              .doc(id)
              .get()
            if (doc.exists) {
              productMap[doc.id] = { id: doc.id, ...doc.data() } as Product
            }
          })()
        )
      }
      await Promise.all(promises)

      return ids.reduce<Product[]>((result, id) => {
        const product = productMap[id]
        product && result.push(product)
        return result
      }, [])
    } else {
      const products: Product[] = []
      const snapshot = await db.collection('products').get()
      snapshot.forEach(doc => {
        const product = { id: doc.id, ...doc.data() } as Product
        products.push(product)
      })
      return products
    }
  }
}

export namespace ProductServiceDI {
  export const symbol = Symbol(ProductService.name)
  export const provider = {
    provide: symbol,
    useClass: ProductService,
  }
  export type type = ProductService
}
