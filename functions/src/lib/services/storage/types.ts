import { Dayjs } from 'dayjs'
import { File } from '@google-cloud/storage'
import { IdToken } from '../../nest'
import { UserRecord } from 'firebase-functions/lib/providers/auth'

//--------------------------------------------------
//  For GraphQL
//--------------------------------------------------

export enum StorageNodeType {
  File = 'File',
  Dir = 'Dir',
}

export interface StoragePaginationOptionsInput {
  maxChunk?: number
  pageToken?: string
}

export interface StoragePaginationResult<T extends StorageNode = StorageNode> {
  list: T[]
  nextPageToken?: string
}

export interface StorageNode {
  id: string
  nodeType: StorageNodeType
  name: string
  dir: string
  path: string
  contentType: string
  size: number
  share: StorageNodeShareSettings
  created: Dayjs
  updated: Dayjs
}

export interface StorageNodeShareSettings {
  isPublic?: boolean
  uids?: string[]
}

export interface StorageNodeShareSettingsInput {
  isPublic?: boolean
  uids?: string[]
}

export class SignedUploadUrlInput {
  filePath!: string
  contentType?: string
}

export interface UploadDataItem {
  data: string | Buffer
  path: string
  contentType: string
}

//--------------------------------------------------
//  For inside of Storage
//--------------------------------------------------

export type StorageUser = Pick<IdToken, 'uid' | 'myDirName'> | Pick<UserRecord, 'uid' | 'customClaims'>

export interface GCSStorageNode extends StorageNode {
  exists: boolean
  gcsNode: File
}

export interface StorageMetadata {
  id: string
  share: StorageNodeShareSettings
  created: Dayjs
  updated: Dayjs
}

export interface StorageMetadataInput {
  id?: string | null
  share?: StorageNodeShareSettings | null
  created?: Dayjs
  updated?: Dayjs
}

export interface StorageRawMetadata {
  id?: string | null
  share?: string | null
  created?: string | null
  updated?: string | null
}
