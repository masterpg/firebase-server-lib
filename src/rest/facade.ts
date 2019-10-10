import { CartItem, Product, RESTFacade } from '@/rest/types'
import { BaseAPI } from '@/rest/base'

export class RESTFacadeImpl extends BaseAPI implements RESTFacade {
  async getProducts(): Promise<Product[]> {
    const response = await this.get<Product[]>('products')
    return response.data
  }

  async getProduct(id: string): Promise<Product> {
    const response = await this.get<Product>(`products/${id}`)
    return response.data
  }

  async getCartItems(): Promise<CartItem[]> {
    const response = await this.get<CartItem[]>('cartItems', { isAuth: true })
    return response.data
  }

  async getCartItem(id: string): Promise<CartItem> {
    const response = await this.get<CartItem>(`cartItems/${id}`, { isAuth: true })
    return response.data
  }

  async putCartItem(id: string, quantity: number): Promise<CartItem> {
    const response = await this.put<CartItem>(`cartItems/${id}`, { quantity }, { isAuth: true })
    return response.data
  }
}
