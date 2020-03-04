import { Dayjs } from 'dayjs'
import { File } from '@google-cloud/storage'
import { IdToken } from '../../nest'
import { UserRecord } from 'firebase-functions/lib/providers/auth'

export type StorageUser = Pick<IdToken, 'uid' | 'myDirName'> | Pick<UserRecord, 'uid' | 'customClaims'>

export enum StorageNodeType {
  File = 'File',
  Dir = 'Dir',
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

export interface StorageNodeShareSettings {
  isPublic: boolean
  uids: string[]
}

export type StorageNodeShareSettingsInput = Partial<StorageNodeShareSettings>

export class SignedUploadUrlInput {
  filePath!: string
  contentType?: string
}

export interface GCSStorageNode extends StorageNode {
  exists: boolean
  gcsNode: File
}

export interface UploadDataItem {
  data: string | Buffer
  path: string
  contentType: string
}
