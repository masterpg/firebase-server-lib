import { Injectable } from '@nestjs/common'
import { Product } from './types'

const PRODUCTS: Product[] = [
  { id: 'product1', title: 'iPad 4 Mini', price: 500.01, stock: 3 },
  { id: 'product2', title: 'Fire HD 8 Tablet', price: 80.99, stock: 5 },
  { id: 'product3', title: 'MediaPad T5 10', price: 150.8, stock: 10 },
]

@Injectable()
class ProductService {
  async create(product: Product): Promise<void> {
    PRODUCTS.push(product)
  }

  async findAll(): Promise<Product[]> {
    return PRODUCTS
  }

  async findOne(id: string): Promise<Product | undefined> {
    return PRODUCTS.find(item => item.id === id)
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
