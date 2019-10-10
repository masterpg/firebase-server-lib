//----------------------------------------------------------------------
//
//  Store
//
//----------------------------------------------------------------------

export interface Store {
  readonly product: ProductModule

  readonly cart: CartModule

  readonly user: UserModule
}

//----------------------------------------------------------------------
//
//  Modules
//
//----------------------------------------------------------------------

export interface ProductModule {
  readonly all: Product[]

  getById(productId: string): Product | undefined

  set(product: StatePartial<Product>): Product | undefined

  setAll(products: Product[]): void

  add(product: Product): Product

  decrementStock(productId: string): void

  incrementStock(productId: string): void
}

export interface CartModule {
  readonly all: CartItem[]

  readonly totalPrice: number

  readonly checkoutStatus: CheckoutStatus

  set(item: StatePartial<Omit<CartItem, 'uid' | 'productId'>>): CartItem | undefined

  setAll(items: CartItem[]): void

  setCheckoutStatus(status: CheckoutStatus): void

  add(item: CartItem): CartItem

  remove(id: string): CartItem | undefined

  getById(id: string): CartItem | undefined

  getByProductId(productId: string): CartItem | undefined
}

export interface UserModule {
  readonly value: User

  set(user: Partial<User>): User

  clear(): void
}

//----------------------------------------------------------------------
//
//  Value objects
//
//----------------------------------------------------------------------

export type StatePartial<T> = Partial<Omit<T, 'id'>> & { id: string }

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

export interface User {
  id: string
  isSignedIn: boolean
  displayName: string
  photoURL: string
  email: string
  emailVerified: boolean
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

export enum ProductsErrorType {
  ItemNotFound = 'itemNotFound',
}

//----------------------------------------------------------------------
//
//  States
//
//----------------------------------------------------------------------

export interface ProductState {
  all: Product[]
}

export interface CartState {
  all: CartItem[]
  checkoutStatus: CheckoutStatus
}

export type UserState = User
