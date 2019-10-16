import * as admin from 'firebase-admin'
import { Injectable } from '@nestjs/common'
import { Product } from './types'

@Injectable()
class ProductService {
  async findList(ids?: string[]): Promise<Product[]> {
    const db = admin.firestore()
    if (ids && ids.length) {
      const promises: Promise<Product | undefined>[] = []
      for (const id of ids) {
        promises.push(
          (async () => {
            const doc = await db
              .collection('products')
              .doc(id)
              .get()
            if (doc.exists) {
              return { id: doc.id, ...doc.data() } as Product
            }
            return undefined
          })()
        )
      }

      const productMap = (await Promise.all(promises)).reduce(
        (result, product) => {
          if (product) result[product.id] = product
          return result
        },
        {} as { [id: string]: Product }
      )

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
