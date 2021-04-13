import * as admin from 'firebase-admin'
import { LangCode, TimestampEntity } from 'web-base-lib'
import { AppError } from '../../base'
import { Dayjs } from 'dayjs'
import { IsPositive } from 'class-validator'

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

type ArticleDirType = 'ListBundle' | 'TreeBundle' | 'Category' | 'Article'

type ArticleContentType = 'Src' | 'Draft'

// eslint-disable-next-line @typescript-eslint/no-redeclare
namespace ArticleContentType {
  export function toSourceIncludes(lang: LangCode, contentType: ArticleContentType): string[]
  export function toSourceIncludes(lang: LangCode, srcTypes: ArticleContentType[]): string[]
  export function toSourceIncludes(arg1: LangCode, arg2: ArticleContentType | ArticleContentType[]): string[] {
    const lang = arg1
    if (Array.isArray(arg2)) {
      return arg2.map(contentType => toSourceInclude(lang, contentType))
    } else {
      return [toSourceInclude(lang, arg2)]
    }
  }

  function toSourceInclude(lang: LangCode, contentType: ArticleContentType): string {
    switch (contentType) {
      case 'Src':
        return ArticleContentFields[lang].SrcContent
      case 'Draft':
        return ArticleContentFields[lang].DraftContent
      default:
        throw new AppError(`Invalid value specified.`, { contentType })
    }
  }
}

const ArticleContentFields = {
  ja: {
    SrcContent: 'article.src.ja.srcContent',
    DraftContent: 'article.src.ja.draftContent',
    SearchContent: 'article.src.ja.searchContent',
  },
  en: {
    SrcContent: 'article.src.en.srcContent',
    DraftContent: 'article.src.en.draftContent',
    SearchContent: 'article.src.en.searchContent',
  },
} as const

interface StorageNode extends CoreStorageNode {
  article?: ArticleDetail
}

interface ArticleDetail {
  type: ArticleDirType
  label: ArticleDirLabelByLang
  sortOrder: number
  src?: ArticleSrcByLang
}

interface ArticleDirLabelByLang {
  ja?: string
  en?: string
}

interface ArticleSrcByLang {
  ja?: ArticleSrcDetail
  en?: ArticleSrcDetail
}

interface ArticleSrcDetail {
  srcContent?: string
  draftContent?: string
  searchContent?: string
  createdAt?: Dayjs
  updatedAt?: Dayjs
}

interface CreateArticleTypeDirInput {
  lang: LangCode
  id?: string
  dir: string
  label: string
  type: ArticleDirType
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

interface SaveArticleSrcContentInput {
  lang: LangCode
  srcContent: string
  searchContent: string
}

interface SaveArticleDraftContentInput {
  lang: LangCode
  draftContent: string | null
}

interface GetArticleContentsNodeInput {
  lang: LangCode
  contentTypes: ArticleContentType[]
}

interface GetArticleSrcContentInput {
  lang: LangCode
  articleId: string
}

interface GetArticleSrcContentResult extends ArticlePathDetail {
  id: string
  label: string
  srcContent: string
  dir: ArticlePathDetail[]
  path: ArticlePathDetail[]
  isPublic: boolean
  createdAt: Dayjs
  updatedAt: Dayjs
}

interface ArticlePathDetail {
  id: string
  label: string
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
  type: ArticleDirType
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
  ArticleContentFields,
  ArticleDetail,
  ArticleDirLabelByLang,
  ArticleDirType,
  ArticleListItem,
  ArticlePathDetail,
  ArticleSrcByLang,
  ArticleSrcDetail,
  ArticleTableOfContentsItem,
  CoreStorageNode,
  CreateArticleGeneralDirInput,
  CreateArticleTypeDirInput,
  CreateStorageDirInput,
  GetArticleContentsNodeInput,
  ArticleContentType,
  GetArticleSrcContentInput,
  GetArticleSrcContentResult,
  GetUserArticleListInput,
  GetUserArticleTableOfContentsInput,
  MoveStorageDirInput,
  MoveStorageFileInput,
  PaginationInput,
  PaginationResult,
  RenameArticleTypeDirInput,
  RenameStorageDirInput,
  RenameStorageFileInput,
  SaveArticleDraftContentInput,
  SaveArticleSrcContentInput,
  SetShareDetailInput,
  SignedUploadUrlInput,
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
