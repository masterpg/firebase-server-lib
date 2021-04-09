import * as admin from 'firebase-admin'
import { Dayjs } from 'dayjs'
import { IsPositive } from 'class-validator'
import { LangCode } from '../../../../../../web-base-lib/dist'
import { TimestampEntity } from 'web-base-lib'

//========================================================================
//
//  Interfaces
//
//========================================================================

type JSON = any
type JSONObject = any

interface PaginationInput {
  maxChunk?: number
  pageToken?: string
}

interface PaginationResult<T = any> {
  list: T[]
  nextPageToken?: string
  isPaginationTimeout?: boolean
}

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
//  CoreStorage
//--------------------------------------------------

type StorageNodeType = 'File' | 'Dir'

interface CoreStorageNode extends TimestampEntity {
  nodeType: StorageNodeType
  name: string
  dir: string
  path: string
  contentType: string
  size: number
  share: StorageNodeShareDetail
  version: number
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

interface StorageNodeShareDetail {
  isPublic: boolean | null
  readUIds: string[] | null
  writeUIds: string[] | null
}

interface SetShareDetailInput {
  isPublic?: boolean | null
  readUIds?: string[] | null
  writeUIds?: string[] | null
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

interface CreateStorageDirInput {
  dir: string
  share?: SetShareDetailInput
}

interface MoveStorageDirInput {
  fromDir: string
  toDir: string
}

interface MoveStorageFileInput {
  fromFile: string
  toFile: string
}

interface RenameStorageDirInput {
  dir: string
  name: string
}

interface RenameStorageFileInput {
  file: string
  name: string
}

//--------------------------------------------------
//  Storage
//--------------------------------------------------

type StorageArticleDirType = 'ListBundle' | 'TreeBundle' | 'Category' | 'Article'

type StorageArticleFileType = 'MasterSrc' | 'DraftSrc'

interface StorageNode extends CoreStorageNode {
  article?: StorageArticleDetail
}

interface StorageArticleDetail {
  dir?: StorageArticleDirDetail
  file?: StorageArticleFileDetail
  src?: StorageArticleSrcByLang
}

interface StorageArticleDirDetail {
  label: StorageArticleDirLabelByLang
  type: StorageArticleDirType
  sortOrder: number
}

interface StorageArticleDirLabelByLang {
  ja?: string
  en?: string
}

interface StorageArticleFileDetail {
  type: StorageArticleFileType
}

interface StorageArticleSrcByLang {
  ja?: StorageArticleSrcDetail
  en?: StorageArticleSrcDetail
}

interface StorageArticleSrcDetail {
  masterId?: string
  draftId?: string
  createdAt?: Dayjs
  updatedAt?: Dayjs
}

interface CreateArticleTypeDirInput {
  lang: LangCode
  id?: string
  dir: string
  label: string
  type: StorageArticleDirType
  sortOrder?: number
  share?: SetShareDetailInput
}

interface CreateArticleGeneralDirInput {
  dir: string
  share?: SetShareDetailInput
}

interface RenameArticleTypeDirInput {
  lang: LangCode
  dir: string
  label: string
}

interface SaveArticleMasterSrcFileInput {
  lang: LangCode
  articleId: string
  srcContent: string
  textContent: string
}

interface SaveArticleMasterSrcFileResult {
  article: StorageNode
  master: StorageNode
  draft: StorageNode
}

interface SaveArticleDraftSrcFileInput {
  lang: LangCode
  articleId: string
  srcContent: string | null
}

interface SaveArticleDraftSrcFileResult {
  article: StorageNode
  draft: StorageNode
}

interface GetArticleSrcInput {
  lang: LangCode
  articleId: string
}

interface ArticlePathDetail {
  id: string
  label: string
}

interface GetArticleSrcResult extends ArticlePathDetail {
  id: string
  label: string
  src: string
  dir: ArticlePathDetail[]
  path: ArticlePathDetail[]
  isPublic: boolean
  createdAt: Dayjs
  updatedAt: Dayjs
}

interface ArticleListItem {
  id: string
  name: string
  dir: string
  path: string
  label: string
  createdAt: Dayjs
  updatedAt: Dayjs
}

interface GetUserArticleListInput {
  lang: LangCode
  userName: string
  articleTypeDirId: string
}

interface ArticleTableOfContentsItem {
  id: string
  type: StorageArticleDirType
  name: string
  dir: string
  path: string
  label: string
}

interface GetUserArticleTableOfContentsInput {
  lang: LangCode
  userName: string
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
export { AuthStatus, UserClaims, UserIdClaims, IdToken, AuthRoleType }
export {
  ArticleListItem,
  ArticlePathDetail,
  ArticleTableOfContentsItem,
  CoreStorageNode,
  CreateArticleGeneralDirInput,
  CreateArticleTypeDirInput,
  CreateStorageDirInput,
  GetArticleSrcInput,
  GetArticleSrcResult,
  GetUserArticleListInput,
  GetUserArticleTableOfContentsInput,
  MoveStorageDirInput,
  MoveStorageFileInput,
  PaginationInput,
  PaginationResult,
  RenameArticleTypeDirInput,
  RenameStorageDirInput,
  RenameStorageFileInput,
  SaveArticleDraftSrcFileInput,
  SaveArticleDraftSrcFileResult,
  SaveArticleMasterSrcFileInput,
  SaveArticleMasterSrcFileResult,
  SetShareDetailInput,
  SignedUploadUrlInput,
  StorageArticleDetail,
  StorageArticleDirDetail,
  StorageArticleDirLabelByLang,
  StorageArticleDirType,
  StorageArticleFileDetail,
  StorageArticleFileType,
  StorageArticleSrcByLang,
  StorageArticleSrcDetail,
  StorageNode,
  StorageNodeGetKeyInput,
  StorageNodeGetKeysInput,
  StorageNodeGetUnderInput,
  StorageNodeKeyInput,
  StorageNodeShareDetail,
  StorageNodeType,
}
export { User, UserInput, SetUserInfoResult, SetUserInfoResultStatus, AuthDataResult }
export { PutTestStoreDataInput, PutTestIndexDataInput, TestSignedUploadUrlInput, TestFirebaseUserInput, TestUserInput }
export { Product, CartItem, CartItemAddInput, CartItemUpdateInput, CartItemEditResponse }
