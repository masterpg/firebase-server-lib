//----------------------------------------------------------------------
//
//  GQL API
//
//----------------------------------------------------------------------

export interface GQLFacade {
  customToken(): Promise<string>

  userStorageBasePath(): Promise<string>

  userStorageDirNodes(dirPath?: string): Promise<GQLStorageNode[]>

  createUserStorageDirs(dirPaths: string[]): Promise<GQLStorageNode[]>

  removeUserStorageFiles(filePaths: string[]): Promise<GQLStorageNode[]>

  removeUserStorageDir(dirPath: string): Promise<GQLStorageNode[]>

  getSignedUploadUrls(params: { filePath: string; contentType?: string }[]): Promise<string[]>

  product(id: string): Promise<GQLProduct | undefined>

  products(ids?: string[]): Promise<GQLProduct[]>

  cartItem(id: string): Promise<GQLCartItem | undefined>

  cartItems(ids?: string[]): Promise<GQLCartItem[]>

  addCartItems(items: GQLAddCartItemInput[]): Promise<GQLEditCartItemResponse[]>

  updateCartItems(items: { id: string; quantity: number }[]): Promise<GQLEditCartItemResponse[]>

  removeCartItems(cartItemIds: string[]): Promise<GQLEditCartItemResponse[]>

  checkoutCart(): Promise<boolean>
}

//----------------------------------------------------------------------
//
//  Value objects
//
//----------------------------------------------------------------------

export interface GQLStorageNode {
  nodeType: GQLStorageNodeType
  name: string
  dir: string
  path: string
}

export enum GQLStorageNodeType {
  File = 'File',
  Dir = 'Dir',
}

export interface GQLProduct {
  id: string
  title: string
  price: number
  stock: number
}

export interface GQLCartItem {
  id: string
  uid: string
  productId: string
  title: string
  price: number
  quantity: number
}

export interface GQLAddCartItemInput {
  productId: string
  title: string
  price: number
  quantity: number
}

export interface GQLUpdateCartItemInput {
  id: string
  quantity: number
}

export interface GQLEditCartItemResponse extends GQLCartItem {
  product: Pick<GQLProduct, 'id' | 'stock'>
}
