import * as admin from 'firebase-admin'
import { DateTimeScalar, LongScalar } from '../gql/base'
import { Field, Float, ID, InputType, Int, InterfaceType, ObjectType, registerEnumType } from '@nestjs/graphql'
import { Dayjs } from 'dayjs'
import { GraphQLJSONObject } from 'graphql-type-json'
import { IsPositive } from 'class-validator'

//========================================================================
//
//  Interfaces
//
//========================================================================

type JSON = any
type JSONObject = any

@InterfaceType()
class TimestampEntity {
  @Field(type => ID)
  id!: string

  @Field(type => DateTimeScalar)
  createdAt!: Dayjs

  @Field(type => DateTimeScalar)
  updatedAt!: Dayjs
}

//--------------------------------------------------
//  Auth
//--------------------------------------------------

enum AuthStatus {
  WaitForEmailVerified = 'WaitForEmailVerified',
  WaitForEntry = 'WaitForEntry',
  Available = 'Available',
}

registerEnumType(AuthStatus, {
  name: 'AuthStatus',
})

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

@ObjectType()
class EnvStorageUsersConfig implements EnvStorageUsersConfig {
  @Field(type => String)
  rootName!: string
}

@ObjectType()
class EnvStorageArticlesConfig implements EnvStorageArticlesConfig {
  @Field(type => String)
  rootName!: string

  @Field(type => String)
  fileName!: string

  @Field(type => String)
  assetsName!: string
}

@ObjectType()
class EnvStorageConfig implements EnvStorageConfig {
  @Field(type => EnvStorageUsersConfig)
  user!: EnvStorageUsersConfig

  @Field(type => EnvStorageArticlesConfig)
  article!: EnvStorageArticlesConfig
}

@ObjectType()
class EnvAppConfig implements EnvAppConfig {
  @Field(type => EnvStorageConfig)
  storage!: EnvStorageConfig
}

//--------------------------------------------------
//  User
//--------------------------------------------------

@ObjectType({ implements: () => [TimestampEntity] })
class PublicProfile implements PublicProfile {
  id!: string
  createdAt!: Dayjs
  updatedAt!: Dayjs

  @Field(type => String)
  displayName!: string

  @Field({ nullable: true })
  photoURL?: string
}

@ObjectType({ implements: () => [TimestampEntity] })
class UserInfo implements UserInfo {
  id!: string
  createdAt!: Dayjs
  updatedAt!: Dayjs

  @Field(type => String)
  fullName!: string

  @Field(type => String)
  email!: string

  @Field(type => Boolean)
  emailVerified!: boolean

  @Field(type => Boolean)
  isAppAdmin!: boolean

  @Field(type => PublicProfile)
  publicProfile!: PublicProfile
}

@InputType()
class UserInfoInput implements UserInfoInput {
  @Field(type => String)
  fullName!: string

  @Field(type => String)
  displayName!: string
}

@ObjectType()
class AuthDataResult implements AuthDataResult {
  @Field(type => AuthStatus)
  status!: AuthStatus

  @Field(type => String)
  token!: string

  @Field(type => UserInfo, { nullable: true })
  user?: UserInfo
}

//--------------------------------------------------
//  Storage
//--------------------------------------------------

enum StorageNodeType {
  File = 'File',
  Dir = 'Dir',
}

registerEnumType(StorageNodeType, {
  name: 'StorageNodeType',
})

enum StorageArticleNodeType {
  ListBundle = 'ListBundle',
  CategoryBundle = 'CategoryBundle',
  Category = 'Category',
  Article = 'Article',
}

registerEnumType(StorageArticleNodeType, {
  name: 'StorageArticleNodeType',
})

@ObjectType()
class StorageNodeShareSettings implements StorageNodeShareSettings {
  @Field(type => Boolean, { nullable: true })
  isPublic!: boolean | null

  @Field(type => [String], { nullable: true })
  readUIds!: string[] | null

  @Field(type => [String], { nullable: true })
  writeUIds!: string[] | null
}

@ObjectType({ implements: () => [TimestampEntity] })
class StorageNode implements StorageNode {
  id!: string
  createdAt!: Dayjs
  updatedAt!: Dayjs

  @Field(type => StorageNodeType)
  nodeType!: StorageNodeType

  @Field(type => String)
  name!: string

  @Field(type => String)
  dir!: string

  @Field(type => String)
  path!: string

  @Field(type => Int)
  level!: number

  @Field(type => String)
  contentType!: string

  @Field(type => Int)
  size!: number

  @Field(type => StorageNodeShareSettings)
  share!: StorageNodeShareSettings

  @Field(type => String, { nullable: true })
  articleNodeName!: string | null

  @Field(type => StorageArticleNodeType, { nullable: true })
  articleNodeType!: StorageArticleNodeType | null

  @Field(type => LongScalar, { nullable: true })
  articleSortOrder!: number | null

  @Field(type => Boolean, { nullable: true })
  isArticleFile!: boolean | null

  @Field(type => Int)
  version!: number
}

@InputType()
class StoragePaginationInput implements StoragePaginationInput {
  @Field(type => Int, { nullable: true })
  maxChunk?: number

  @Field(type => String, { nullable: true })
  pageToken?: string
}

@ObjectType()
class StoragePaginationResult<T extends StorageNode = StorageNode> implements StoragePaginationResult {
  @Field(type => [StorageNode])
  list!: T[]

  @Field(type => String, { nullable: true })
  nextPageToken?: string
}

@InputType()
class StorageNodeShareSettingsInput implements StorageNodeShareSettingsInput {
  @Field(type => Boolean, { nullable: true })
  isPublic?: boolean | null

  @Field(type => [String], { nullable: true })
  readUIds?: string[] | null

  @Field(type => [String], { nullable: true })
  writeUIds?: string[] | null
}

@InputType()
class StorageNodeKeyInput implements StorageNodeKeyInput {
  @Field(type => String, { nullable: true })
  id?: string

  @Field(type => String, { nullable: true })
  path?: string
}

@InputType()
class SignedUploadUrlInput implements SignedUploadUrlInput {
  @Field(type => String)
  filePath!: string

  @Field(type => String, { nullable: true })
  contentType?: string
}

@InputType()
class CreateStorageNodeInput extends StorageNodeShareSettingsInput {}

@InputType()
class CreateArticleTypeDirInput implements CreateArticleTypeDirInput {
  @Field(type => String)
  dir!: string

  @Field(type => String)
  articleNodeName!: string

  @Field(type => StorageArticleNodeType)
  articleNodeType!: StorageArticleNodeType
}

@InputType()
class SetArticleSortOrderInput implements SetArticleSortOrderInput {
  @Field(type => String, { nullable: true })
  insertBeforeNodePath?: string

  @Field(type => String, { nullable: true })
  insertAfterNodePath?: string
}

//--------------------------------------------------
//  Dev
//--------------------------------------------------

@InputType()
class PutTestStoreDataInput implements PutTestStoreDataInput {
  @Field(type => String)
  collectionName!: string

  @Field(type => [GraphQLJSONObject])
  collectionRecords!: JSONObject[]
}

@InputType()
class TestSignedUploadUrlInput implements TestSignedUploadUrlInput {
  @Field(type => String)
  filePath!: string

  @Field(type => String, { nullable: true })
  contentType?: string
}

@InputType()
class TestFirebaseUserInput implements TestFirebaseUserInput {
  @Field(type => ID)
  uid!: string

  @Field(type => String, { nullable: true })
  email?: string

  @Field(type => Boolean, { nullable: true })
  emailVerified?: boolean

  @Field(type => String, { nullable: true })
  password?: string

  @Field(type => String, { nullable: true })
  displayName?: string

  @Field(type => Boolean, { nullable: true })
  disabled?: boolean

  @Field(type => String, { nullable: true })
  photoURL?: string

  @Field(type => GraphQLJSONObject, { nullable: true })
  customClaims?: UserClaims
}

@InputType()
class TestUserInput implements TestFirebaseUserInput, UserInfoInput {
  @Field(type => ID)
  uid!: string

  @Field(type => String, { nullable: true })
  email?: string

  @Field(type => Boolean, { nullable: true })
  emailVerified?: boolean

  @Field(type => String, { nullable: true })
  password?: string

  @Field(type => Boolean, { nullable: true })
  disabled?: boolean

  @Field(type => String, { nullable: true })
  photoURL?: string

  @Field(type => GraphQLJSONObject, { nullable: true })
  customClaims?: UserClaims

  @Field(type => String)
  fullName!: string

  @Field(type => String)
  displayName!: string
}

//--------------------------------------------------
//  Example Shop
//--------------------------------------------------

@ObjectType({ implements: () => [TimestampEntity] })
class Product implements Product {
  id!: string
  createdAt!: Dayjs
  updatedAt!: Dayjs

  @Field(type => String)
  title!: string

  @Field(type => Float)
  price!: number

  @Field(type => Int)
  stock!: number
}

@ObjectType({ implements: () => [TimestampEntity] })
class CartItem implements CartItem {
  id!: string
  createdAt!: Dayjs
  updatedAt!: Dayjs

  @Field(type => ID)
  uid!: string

  @Field(type => ID)
  productId!: string

  @Field(type => String)
  title!: string

  @Field(type => Float)
  price!: number

  @Field(type => Int)
  quantity!: number
}

@InputType()
class CartItemAddInput implements CartItemAddInput {
  @Field(type => ID)
  productId!: string

  @Field(type => String)
  title!: string

  @Field(type => Float)
  @IsPositive()
  price!: number

  @Field(type => Int)
  @IsPositive()
  quantity!: number
}

@InputType()
class CartItemUpdateInput implements CartItemUpdateInput {
  @Field(type => ID)
  id!: string

  @Field(type => Int)
  @IsPositive()
  quantity!: number
}

@ObjectType({ implements: () => [TimestampEntity] })
class CartItemEditResponse implements CartItemEditResponse {
  id!: string
  createdAt!: Dayjs
  updatedAt!: Dayjs

  @Field(type => ID)
  uid!: string

  @Field(type => ID)
  productId!: string

  @Field(type => String)
  title!: string

  @Field(type => Float)
  price!: number

  @Field(type => Int)
  quantity!: number

  @Field(type => Product)
  product!: Product
}

//========================================================================
//
//  Exports
//
//========================================================================

export { JSON, JSONObject }
export { TimestampEntity }
export { AuthStatus, UserClaims, UserIdClaims, IdToken, AuthRoleType }
export { EnvAppConfig, EnvStorageConfig, EnvStorageUsersConfig, EnvStorageArticlesConfig }
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
