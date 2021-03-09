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

interface Entity {
  id: string
  version: number
}

interface EntityTimestamp {
  createdAt: Dayjs
  updatedAt: Dayjs
}

type OmitTimestamp<T = unknown> = Omit<T, 'createdAt' | 'updatedAt'>

type ToEntityTimestamp<T = unknown> = {
  [K in keyof T]: K extends 'createdAt'
    ? T[K] extends string
      ? Dayjs
      : T[K] extends string | undefined
      ? Dayjs | undefined
      : T[K] extends string | null
      ? Dayjs | null
      : T[K]
    : K extends 'updatedAt'
    ? T[K] extends string
      ? Dayjs
      : T[K] extends string | undefined
      ? Dayjs | undefined
      : T[K] extends string | null
      ? Dayjs | null
      : T[K]
    : T[K]
}

interface EntityTimestamp {
  createdAt: Dayjs
  updatedAt: Dayjs
}

type TimestampEntity<T = unknown> = Entity & OmitTimestamp<T> & EntityTimestamp

//--------------------------------------------------
//  Auth
//--------------------------------------------------

type AuthStatus = 'WaitForEmailVerified' | 'WaitForEntry' | 'Available'

enum AuthRoleType {
  AppAdmin = 'AppAdmin',
}

interface UserClaims {
  isAppAdmin?: boolean
  authStatus?: AuthStatus
  readableNodeId?: string
  writableNodeId?: string
}

interface UserIdClaims extends UserClaims {
  uid: string
}

interface IdToken extends admin.auth.DecodedIdToken, UserClaims {}

//--------------------------------------------------
//  User
//--------------------------------------------------

interface User extends TimestampEntity {
  email: string
  emailVerified: boolean
  userName: string
  fullName: string
  isAppAdmin: boolean
  photoURL?: string
}

interface UserInput {
  userName: string
  fullName: string
  photoURL?: string
}

interface SetUserInfoResult {
  status: SetUserInfoResultStatus
  user?: User
}

type SetUserInfoResultStatus = 'AlreadyExists' | 'Success'

interface AuthDataResult {
  status: AuthStatus
  token: string
  user?: User
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
  share: StorageNodeShareDetail
  version: number
}

interface StorageNode extends CoreStorageNode {
  article?: StorageArticleDetail
}

interface ArticleTableOfContentsNode extends TimestampEntity {
  type: StorageArticleDirType
  name: string
  dir: string
  path: string
  label: string
}

type StorageNodeType = 'File' | 'Dir'

type StorageArticleDirType = 'ListBundle' | 'TreeBundle' | 'Category' | 'Article'

type StorageArticleFileType = 'Master' | 'Draft'

interface StorageNodeShareDetail {
  isPublic: boolean | null
  readUIds: string[] | null
  writeUIds: string[] | null
}

interface StorageArticleDetail {
  dir?: StorageArticleDirDetail
  file?: StorageArticleFileDetail
}

interface StorageArticleDirDetail {
  name: string
  type: StorageArticleDirType
  sortOrder: number
}

interface StorageArticleFileDetail {
  type: StorageArticleFileType
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

interface SetShareDetailInput {
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

interface StorageNodeGetUnderInput {
  id?: string
  path?: string
  includeBase?: boolean
}

interface SignedUploadUrlInput {
  id: string
  path: string
  contentType?: string
}

interface CreateStorageNodeOptions {
  share?: SetShareDetailInput
}

interface CreateArticleTypeDirInput {
  dir: string
  name: string
  type: StorageArticleDirType
  sortOrder?: number
}

interface SaveArticleMasterSrcFileResult {
  master: StorageNode
  draft: StorageNode
}

interface GetArticleChildrenInput {
  dirPath: string
  types: StorageArticleDirType[]
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

interface TestFirebaseUserInput extends UserClaims {
  uid: string
  email?: string
  emailVerified?: boolean
  password?: string
  disabled?: boolean
}

interface TestUserInput extends TestFirebaseUserInput, UserInput {}

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
export { Entity, EntityTimestamp, OmitTimestamp, TimestampEntity }
export { AuthStatus, UserClaims, UserIdClaims, IdToken, AuthRoleType }
export {
  ArticleTableOfContentsNode,
  CoreStorageNode,
  CreateArticleTypeDirInput,
  CreateStorageNodeOptions,
  GetArticleChildrenInput,
  SaveArticleMasterSrcFileResult,
  SetShareDetailInput,
  SignedUploadUrlInput,
  StorageArticleDetail,
  StorageArticleDirDetail,
  StorageArticleDirType,
  StorageArticleFileDetail,
  StorageArticleFileType,
  StorageNode,
  StorageNodeGetKeyInput,
  StorageNodeGetKeysInput,
  StorageNodeGetUnderInput,
  StorageNodeKeyInput,
  StorageNodeShareDetail,
  StorageNodeType,
  StoragePaginationInput,
  StoragePaginationResult,
  ToEntityTimestamp,
}
export { User, UserInput, SetUserInfoResult, SetUserInfoResultStatus, AuthDataResult }
export { PutTestStoreDataInput, PutTestIndexDataInput, TestSignedUploadUrlInput, TestFirebaseUserInput, TestUserInput }
export { Product, CartItem, CartItemAddInput, CartItemUpdateInput, CartItemEditResponse }
