import * as admin from 'firebase-admin'
import { Injectable, Module } from '@nestjs/common'
import { Product } from './base'

//========================================================================
//
//  Implementation
//
//========================================================================

@Injectable()
class ProductService {
  async findList(ids?: string[]): Promise<Product[]> {
    const db = admin.firestore()
    if (ids && ids.length) {
      const productDict: { [id: string]: Product } = {}
      const promises: Promise<void>[] = []
      for (const id of ids) {
        promises.push(
          (async () => {
            const doc = await db.collection('products').doc(id).get()
            if (doc.exists) {
              productDict[doc.id] = { id: doc.id, ...doc.data() } as Product
            }
          })()
        )
      }
      await Promise.all(promises)

      return ids.reduce<Product[]>((result, id) => {
        const product = productDict[id]
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

namespace ProductServiceDI {
  export const symbol = Symbol(ProductService.name)
  export const provider = {
    provide: symbol,
    useClass: ProductService,
  }
  export type type = ProductService
}

@Module({
  providers: [ProductServiceDI.provider],
  exports: [ProductServiceDI.provider],
})
class ProductServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { ProductServiceDI, ProductServiceModule }
