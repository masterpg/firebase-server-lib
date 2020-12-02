import * as admin from 'firebase-admin'
import { Dayjs } from 'dayjs'
import { IsPositive } from 'class-validator'

//========================================================================
//
//  Interfaces
//
//========================================================================

type JSON = any
type JSONObject = any

interface TimestampEntity {
  id: string
  createdAt: Dayjs
  updatedAt: Dayjs
}

//--------------------------------------------------
//  Auth
//--------------------------------------------------

enum AuthStatus {
  WaitForEmailVerified = 'WaitForEmailVerified',
  WaitForEntry = 'WaitForEntry',
  Available = 'Available',
}

enum AuthRoleType {
  AppAdmin = 'AppAdmin',
}

interface UserClaims {
  isAppAdmin?: boolean
  authStatus?: AuthStatus
}

interface UserIdClaims extends UserClaims {
  uid: string
}

interface IdToken extends admin.auth.DecodedIdToken, UserClaims {}

//--------------------------------------------------
//  Env
//--------------------------------------------------

interface AppConfig {
  storage: StorageConfig
}

interface StorageConfig {
  user: StorageUsersConfig
  article: StorageArticlesConfig
}

interface StorageUsersConfig {
  rootName: string
}

interface StorageArticlesConfig {
  rootName: string
  fileName: string
  assetsName: string
}

//--------------------------------------------------
//  User
//--------------------------------------------------

interface PublicProfile extends TimestampEntity {
  displayName: string
  photoURL?: string
}

interface UserInfo extends TimestampEntity {
  fullName: string
  email: string
  emailVerified: boolean
  isAppAdmin: boolean
  publicProfile: PublicProfile
}

interface UserInfoInput {
  fullName: string
  displayName: string
}

interface AuthDataResult {
  status: AuthStatus
  token: string
  user?: UserInfo
}

//--------------------------------------------------
//  Storage
//--------------------------------------------------

enum StorageNodeType {
  File = 'File',
  Dir = 'Dir',
}

enum StorageArticleNodeType {
  ListBundle = 'ListBundle',
  CategoryBundle = 'CategoryBundle',
  Category = 'Category',
  Article = 'Article',
}

interface StorageNodeShareSettings {
  isPublic: boolean | null
  readUIds: string[] | null
  writeUIds: string[] | null
}

interface StorageNode extends TimestampEntity {
  nodeType: StorageNodeType
  name: string
  dir: string
  path: string
  level: number
  contentType: string
  size: number
  share: StorageNodeShareSettings
  articleNodeName: string | null
  articleNodeType: StorageArticleNodeType | null
  articleSortOrder: number | null
  isArticleFile: boolean | null
  version: number
}

interface StoragePaginationInput {
  maxChunk?: number
  pageToken?: string
}

interface StoragePaginationResult<T extends StorageNode = StorageNode> {
  list: T[]
  nextPageToken?: string
}

interface StorageNodeShareSettingsInput {
  isPublic?: boolean | null
  readUIds?: string[] | null
  writeUIds?: string[] | null
}

interface StorageNodeKeyInput {
  id?: string
  path?: string
}

interface SignedUploadUrlInput {
  filePath: string
  contentType?: string
}

interface CreateStorageNodeInput extends StorageNodeShareSettingsInput {}

interface CreateArticleTypeDirInput {
  dir: string
  articleNodeName: string
  articleNodeType: StorageArticleNodeType
}

interface SetArticleSortOrderInput {
  insertBeforeNodePath?: string
  insertAfterNodePath?: string
}

//--------------------------------------------------
//  Dev
//--------------------------------------------------

interface PutTestStoreDataInput {
  collectionName: string
  collectionRecords: JSONObject[]
}

interface TestSignedUploadUrlInput {
  filePath: string
  contentType?: string
}

interface TestFirebaseUserInput {
  uid: string
  email?: string
  emailVerified?: boolean
  password?: string
  displayName?: string
  disabled?: boolean
  photoURL?: string
  customClaims?: UserClaims
}

interface TestUserInput extends TestFirebaseUserInput, UserInfoInput {
  displayName: string
}

//--------------------------------------------------
//  Example Shop
//--------------------------------------------------

interface Product extends TimestampEntity {
  title: string
  price: number
  stock: number
}

interface CartItem extends TimestampEntity {
  uid: string
  productId: string
  title: string
  price: number
  quantity: number
}

class CartItemAddInput {
  productId!: string
  title!: string
  @IsPositive() price!: number
  @IsPositive() quantity!: number
}

class CartItemUpdateInput {
  id!: string
  @IsPositive() quantity!: number
}

interface CartItemEditResponse extends TimestampEntity {
  uid: string
  productId: string
  title: string
  price: number
  quantity: number
  product: Product
}

//========================================================================
//
//  Exports
//
//========================================================================

export { JSON, JSONObject }
export { TimestampEntity }
export { AuthStatus, UserClaims, UserIdClaims, IdToken, AuthRoleType }
export { AppConfig, StorageConfig, StorageUsersConfig, StorageArticlesConfig }
export {
  StorageNodeType,
  StorageArticleNodeType,
  StorageNodeShareSettings,
  StorageNode,
  StoragePaginationInput,
  StoragePaginationResult,
  StorageNodeShareSettingsInput,
  StorageNodeKeyInput,
  SignedUploadUrlInput,
  CreateStorageNodeInput,
  CreateArticleTypeDirInput,
  SetArticleSortOrderInput,
}
export { PublicProfile, UserInfo, UserInfoInput, AuthDataResult }
export { PutTestStoreDataInput, TestSignedUploadUrlInput, TestFirebaseUserInput, TestUserInput }
export { Product, CartItem, CartItemAddInput, CartItemUpdateInput, CartItemEditResponse }
