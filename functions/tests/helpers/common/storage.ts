import * as admin from 'firebase-admin'
import * as path from 'path'
import { StorageNode, StorageNodeType, StorageService, StoreService } from '../../../src/lib'
import { removeBothEndsSlash, removeStartDirChars } from 'web-base-lib'
import { AppStorageNode } from '../../../src/example/services/store'
import { cloneDeep } from 'lodash'
import dayjs = require('dayjs')
import { generateFirestoreId } from './base'

//========================================================================
//
//  Interfaces
//
//========================================================================

type TestStorageService = StorageService & {
  sortNodes: StorageService['sortNodes']
}

interface ResponseStorageNode extends Omit<AppStorageNode, 'level' | 'createdAt' | 'updatedAt'> {
  createdAt: string
  updatedAt: string
}

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
    level: StorageService.getNodeLevel(dirPath),
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
    level: StorageService.getNodeLevel(filePath),
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

/**
 * 全てのノードを削除します。
 * @param storeService
 */
async function removeAllNodes(storeService: StoreService): Promise<void> {
  // バケットのファイルを削除
  const bucket = admin.storage().bucket()
  const [files] = await bucket.getFiles({ prefix: '' })
  await Promise.all(
    files.map(async file => {
      await file.delete()
    })
  )
  // ストアのノードを削除
  const nodes = await storeService.storageDao.where('path', '>=', '').fetch()
  await Promise.all(
    nodes.map(async node => {
      await storeService.storageDao.delete(node.id)
    })
  )
}

/**
 * 指定されたノードが存在することを検証します。
 * @param nodes
 * @param storageService
 */
async function existsNodes(nodes: StorageNode[], storageService: StorageService): Promise<void> {
  for (const node of nodes) {
    // ディレクトリの末尾が'/'でないことを検証
    expect(node.dir.endsWith('/')).toBeFalsy()
    // node.path が ｢node.dir + node.name｣ と一致することを検証
    expect(node.path).toBe(removeStartDirChars(path.join(node.dir, node.name)))
    // バージョンの検証
    expect(node.version >= 1).toBeTruthy()
    // タイムスタンプの検証
    expect(dayjs.isDayjs(node.createdAt)).toBeTruthy()
    expect(dayjs.isDayjs(node.updatedAt)).toBeTruthy()
    // ストアに対象ノードが存在することを確認
    expect(await storageService.getNodeByPath(node.path)).toMatchObject(node)
    expect(await storageService.getNodeById(node.id)).toMatchObject(node)
    // ノードがファイルの場合
    if (node.nodeType === StorageNodeType.File) {
      // ストレージに対象ファイルが存在することを検証
      const fileDetail = await storageService.getStorageFile(node.path)
      expect(fileDetail.exists).toBeTruthy()
      expect(fileDetail.version).toBe(node.version)
    }
  }
}

/**
 * 指定されたノードが存在しないことを検証します。
 * @param nodes
 * @param storageService
 */
async function notExistsNodes(nodes: StorageNode[], storageService: StorageService): Promise<void> {
  for (const node of nodes) {
    // node.path が ｢node.dir + node.name｣ と一致することを検証
    expect(node.path).toBe(path.join(node.dir, node.name))
    // バージョンの検証
    expect(node.version >= 1).toBeTruthy()
    // タイムスタンプの検証
    expect(dayjs.isDayjs(node.createdAt)).toBeTruthy()
    expect(dayjs.isDayjs(node.updatedAt)).toBeTruthy()
    // ストアに対象ノードが存在しないことを確認
    expect(await storageService.getNodeByPath(node.path)).toBeUndefined()
    expect(await storageService.getNodeById(node.id)).toBeUndefined()
    // ノードがファイルの場合
    if (node.nodeType === StorageNodeType.File) {
      // ストレージに対象ファイルが存在しないことを検証
      const fileDetail = await storageService.getStorageFile(node.path)
      expect(fileDetail.exists).toBeFalsy()
    }
  }
}

/**
 * 移動ノードの検証を行います。
 * @param fmNodes 移動前ノード ※移動する前に取得しておいたノード
 * @param toNodes 移動後ノード
 * @param storageService
 * @param storeService
 */
async function verifyMoveNodes(fmNodes: StorageNode[], toNodes: StorageNode[], storageService: StorageService, storeService: StoreService) {
  ;(storageService as TestStorageService).sortNodes(fmNodes)
  ;(storageService as TestStorageService).sortNodes(toNodes)

  for (let i = 0; i < toNodes.length; i++) {
    const fmNode = fmNodes[i]
    const toNode = toNodes[i]

    // 移動前と移動後のストアノードを比較検証
    expect(toNode.createdAt).toEqual(fmNode.createdAt)
    expect(toNode.updatedAt).toEqual(fmNode.updatedAt)
    expect(toNode.version).toBe(fmNode.version + 1)

    // 移動前ノードが存在しないことを検証
    const fmNode_fetched = await storageService.getNodeByPath(fmNode.path)
    expect(fmNode_fetched).toBeUndefined()
    if (fmNode.nodeType === StorageNodeType.File) {
      const fileNode = await storageService.getFileNodeByPath(fmNode.path)
      expect(fileNode).toBeUndefined()
    }

    // 移動後ノードが存在することを検証
    // ※移動後ノードが複数存在しないことも検証
    const toNode_fetched = await storeService.storageDao.where('path', '==', toNode.path).fetch()
    if (toNode_fetched.length === 0) {
      throw new Error(`The destination node does not exist: '${toNode.path}'`)
    }
    if (toNode_fetched.length > 1) {
      throw new Error(`There are multiple destination nodes: '${toNode.path}'`)
    }
    if (toNode.nodeType === StorageNodeType.File) {
      const fileDetail = await storageService.getStorageFile(toNode.path)
      expect(fileDetail.exists).toBeTruthy()
      expect(fileDetail.version).toBe(toNode.version)
    }
  }
}

/**
 * `StorageNode`をGraphQLの実行結果となるHTTPレスポンス形式へ変換します。
 * @param node
 */
function toGQLResponseStorageNode(node: StorageNode): ResponseStorageNode {
  return {
    id: node.id,
    nodeType: node.nodeType,
    name: node.name,
    dir: node.dir,
    path: node.path,
    contentType: node.contentType,
    size: node.size,
    share: {
      isPublic: node.share.isPublic ?? null,
      readUIds: node.share.readUIds ?? null,
      writeUIds: node.share.writeUIds ?? null,
    },
    version: node.version,
    createdAt: node.createdAt.toISOString(),
    updatedAt: node.updatedAt.toISOString(),
  }
}

/**
 * `StorageNode`をGraphQLを叩いた結果であるHTTPレスポンス形式へ変換します。
 * @param nodes
 */
function toGQLResponseStorageNodes(nodes: StorageNode[]): ResponseStorageNode[] {
  return nodes.map(node => toGQLResponseStorageNode(node))
}

//========================================================================
//
//  Exports
//
//========================================================================

export {
  newTestStorageDirNode,
  newTestStorageFileNode,
  cloneTestStorageNode,
  removeAllNodes,
  existsNodes,
  notExistsNodes,
  verifyMoveNodes,
  toGQLResponseStorageNodes,
  toGQLResponseStorageNode,
}
