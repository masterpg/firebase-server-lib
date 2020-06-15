import * as path from 'path'
import { StorageNode, StorageNodeType } from '../../../src/lib/services'
import { removeBothEndsSlash, removeStartDirChars } from 'web-base-lib'
import { cloneDeep } from 'lodash'
import dayjs = require('dayjs')
import { generateFirestoreId } from './firestore'

//========================================================================
//
//  Implementation
//
//========================================================================

function newTestStorageDirNode(dirPath: string, data?: Partial<Omit<StorageNode, 'name' | 'dir' | 'path' | 'nodeType'>>): StorageNode {
  dirPath = removeBothEndsSlash(dirPath)
  data = data || {}
  const name = path.basename(dirPath)
  const dir = removeStartDirChars(path.dirname(dirPath))
  const result: StorageNode = {
    id: data.id || generateFirestoreId(),
    nodeType: StorageNodeType.Dir,
    name,
    dir,
    path: dirPath,
    contentType: data.contentType || '',
    size: data.size || 0,
    share: data.share || { isPublic: null, readUIds: null, writeUIds: null },
    version: 1,
    createdAt: data.createdAt || dayjs(),
    updatedAt: data.updatedAt || dayjs(),
  }
  return result
}

function newTestStorageFileNode(filePath: string, data?: Partial<Omit<StorageNode, 'name' | 'dir' | 'path' | 'nodeType'>>): StorageNode {
  filePath = removeBothEndsSlash(filePath)
  data = data || {}
  const name = path.basename(filePath)
  const dir = removeStartDirChars(path.dirname(filePath))
  const result: StorageNode = {
    id: data.id || generateFirestoreId(),
    nodeType: StorageNodeType.File,
    name,
    dir,
    path: filePath,
    contentType: data.contentType || 'text/plain; charset=utf-8',
    size: data.size || 5,
    share: data.share || { isPublic: null, readUIds: null, writeUIds: null },
    version: 1,
    createdAt: data.createdAt || dayjs(),
    updatedAt: data.updatedAt || dayjs(),
  }
  return result
}

function cloneTestStorageNode(target: StorageNode, source: Partial<StorageNode>): StorageNode {
  return Object.assign({}, cloneDeep(target), cloneDeep(source))
}

//========================================================================
//
//  Exports
//
//========================================================================

export { newTestStorageDirNode, newTestStorageFileNode, cloneTestStorageNode }
