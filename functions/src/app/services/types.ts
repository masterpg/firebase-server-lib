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

interface CoreStorageNode extends TimestampEntity {
  nodeType: StorageNodeType
  name: string
  dir: string
  path: string
  level: number
  contentType: string
  size: number
  share: StorageNodeShareSettings
  version: number
}

interface StorageNode extends CoreStorageNode {
  article?: StorageArticleSettings
}

enum StorageNodeType {
  File = 'File',
  Dir = 'Dir',
}

enum StorageArticleDirType {
  ListBundle = 'ListBundle',
  CategoryBundle = 'CategoryBundle',
  Category = 'Category',
  Article = 'Article',
}

enum StorageArticleFileType {
  Index = 'Index',
  Draft = 'Draft',
}

interface StorageNodeShareSettings {
  isPublic: boolean | null
  readUIds: string[] | null
  writeUIds: string[] | null
}

interface StorageArticleSettings {
  dir?: StorageArticleDirSettings
  file?: StorageArticleFileSettings
}

interface StorageArticleDirSettings {
  name: string
  type: StorageArticleDirType
  sortOrder: number
}

interface StorageArticleFileSettings {
  type: StorageArticleFileType
  content: string
}

interface StoragePaginationInput {
  maxChunk?: number
  pageToken?: string
}

interface StoragePaginationResult<T extends CoreStorageNode = CoreStorageNode> {
  list: T[]
  nextPageToken?: string
  isPaginationTimeout?: boolean
}

interface StorageNodeShareSettingsInput {
  isPublic?: boolean | null
  readUIds?: string[] | null
  writeUIds?: string[] | null
}

interface StorageNodeKeyInput {
  id: string
  path: string
}

interface StorageNodeGetKeyInput {
  id?: string
  path?: string
}

interface StorageNodeGetKeysInput {
  ids?: string[]
  paths?: string[]
}

interface SignedUploadUrlInput {
  id: string
  path: string
  contentType?: string
}

interface CreateStorageNodeInput extends StorageNodeShareSettingsInput {}

interface CreateArticleTypeDirInput {
  dir: string
  name: string
  type: StorageArticleDirType
  sortOrder?: number
}

//--------------------------------------------------
//  Dev
//--------------------------------------------------

interface PutTestStoreDataInput {
  collectionName: string
  collectionRecords: JSONObject[]
}

interface PutTestIndexDataInput {
  index: string
  data: JSONObject[]
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
  StorageNode,
  CreateArticleTypeDirInput,
  CreateStorageNodeInput,
  SignedUploadUrlInput,
  StorageArticleDirSettings,
  StorageArticleDirType,
  StorageArticleFileSettings,
  StorageArticleFileType,
  StorageArticleSettings,
  CoreStorageNode,
  StorageNodeGetKeyInput,
  StorageNodeGetKeysInput,
  StorageNodeKeyInput,
  StorageNodeShareSettings,
  StorageNodeShareSettingsInput,
  StorageNodeType,
  StoragePaginationInput,
  StoragePaginationResult,
}
export { PublicProfile, UserInfo, UserInfoInput, AuthDataResult }
export { PutTestStoreDataInput, PutTestIndexDataInput, TestSignedUploadUrlInput, TestFirebaseUserInput, TestUserInput }
export { Product, CartItem, CartItemAddInput, CartItemUpdateInput, CartItemEditResponse }
