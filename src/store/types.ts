//----------------------------------------------------------------------
//
//  Store
//
//----------------------------------------------------------------------

export interface Store {
  readonly products: ProductsModule

  readonly cart: CartModule
}

//----------------------------------------------------------------------
//
//  Modules
//
//----------------------------------------------------------------------

export interface ProductsModule {
  products: Product[]

  getProductById(productId: string): Product | undefined

  setProducts(products: Product[]): void

  decrementInventory(productId: string): void
}

export interface CartModule {
  all: CartItem[]

  totalPrice: number

  checkoutStatus: CheckoutStatus

  setAll(items: CartItem[]): void

  setCheckoutStatus(status: CheckoutStatus): void

  addProductToCart(product: Product): CartItem

  incrementQuantity(productId: string): void
}

//----------------------------------------------------------------------
//
//  Data types
//
//----------------------------------------------------------------------

export interface Product {
  id: string
  title: string
  price: number
  inventory: number
}

export interface CartItem {
  id: string
  title: string
  price: number
  quantity: number
}

//----------------------------------------------------------------------
//
//  Enumerations
//
//----------------------------------------------------------------------

export enum CheckoutStatus {
  None = 'none',
  Failed = 'failed',
  Successful = 'successful',
}

//----------------------------------------------------------------------
//
//  Errors
//
//----------------------------------------------------------------------

export class StoreError<T> extends Error {
  constructor(type: T) {
    super()
    this.errorType = type
  }

  errorType: T
}

export enum CartModuleErrorType {
  ItemNotFound = 'itemNotFound',
}

export enum ProductErrorType {
  ItemNotFound = 'itemNotFound',
}

//----------------------------------------------------------------------
//
//  States
//
//----------------------------------------------------------------------

export interface ProductsState {
  products: Product[]
}

export interface CartState {
  all: CartItem[]
  checkoutStatus: CheckoutStatus
}
