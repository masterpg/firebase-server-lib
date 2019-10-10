//----------------------------------------------------------------------
//
//  REST API
//
//----------------------------------------------------------------------

export interface RESTFacade {
  getProducts(): Promise<Product[]>

  getProduct(id: string): Promise<Product>

  getCartItems(): Promise<CartItem[]>

  getCartItem(id: string): Promise<CartItem>

  putCartItem(id: string, quantity: number): Promise<CartItem>
}

//----------------------------------------------------------------------
//
//  Value objects
//
//----------------------------------------------------------------------

export interface Product {
  id: string
  title: string
  price: number
  stock: number
}

export interface CartItem {
  id: string
  uid: string
  productId: string
  title: string
  price: number
  quantity: number
}
