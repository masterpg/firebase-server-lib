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

export interface GetStorageOptionsInput {
  maxResults?: number
  pageToken?: string
}

export interface GetStorageResult {
  list: StorageNode[]
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
}

export interface StorageMetadataInput {
  id?: string | null
  share?: StorageNodeShareSettings | null
}

export interface StorageRawMetadata {
  id?: string | null
  share?: string | null
}
