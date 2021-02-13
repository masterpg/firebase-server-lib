import * as _path from 'path'
import * as admin from 'firebase-admin'
import { CoreStorageNode, StorageNode, StorageNodeType, StorageService, StorageServiceDI } from '../../../../src/app/services'
import { removeBothEndsSlash, removeStartDirChars } from 'web-base-lib'
import { CoreStorageSchema } from '../../../../src/app/services'
import { CoreStorageService } from '../../../../src/app/services/core-storage'
import dayjs = require('dayjs')
import { newElasticClient } from '../../../../src/app/base/elastic'

//========================================================================
//
//  Interfaces
//
//========================================================================

type CoreStorageTestService = CoreStorageService & {
  client: CoreStorageService['client']
  m_validateBrowsableNodesTargetToNodePaths: StorageServiceDI.type['m_validateBrowsableNodesTargetToNodePaths']
}

type StorageTestService = StorageService &
  CoreStorageTestService & {
    m_validateArticleRootUnder: StorageServiceDI.type['m_validateArticleRootUnder']
    m_getBelongToArticleBundle: StorageServiceDI.type['m_getBelongToArticleBundle']
  }

//========================================================================
//
//  Implementation
//
//========================================================================

class CoreStorageTestHelper {
  constructor(protected storageService: CoreStorageTestService) {}

  /**
   * 全てのノードを削除します。
   */
  async removeAllNodes(): Promise<void> {
    // バケットのファイルを削除
    const bucket = admin.storage().bucket()
    const [files] = await bucket.getFiles({ prefix: '' })
    await Promise.all(
      files.map(async file => {
        await file.delete({ ignoreNotFound: true })
      })
    )
    // Elasticsearchのノードを削除
    const client = newElasticClient()
    await client.deleteByQuery({
      index: CoreStorageSchema.IndexAlias,
      body: {
        query: {
          match_all: {},
        },
      },
      refresh: true,
    })
  }

  /**
   * 指定されたノードが存在することを検証します。
   * @param nodes
   */
  async existsNodes(nodes: CoreStorageNode[]): Promise<void> {
    await Promise.all(
      nodes.map(async node => {
        // ディレクトリの末尾が'/'でないことを検証
        expect(node.dir.endsWith('/')).toBeFalsy()
        // node.path が ｢node.dir + node.name｣ と一致することを検証
        expect(node.path).toBe(removeStartDirChars(_path.join(node.dir, node.name)))
        // バージョンの検証
        expect(node.version >= 1).toBeTruthy()
        // タイムスタンプの検証
        expect(dayjs.isDayjs(node.createdAt)).toBeTruthy()
        expect(dayjs.isDayjs(node.updatedAt)).toBeTruthy()
        // データベースに対象ノードが存在することを確認
        expect(node).toMatchObject(await this.storageService.sgetNode({ path: node.path }))
        expect(node).toMatchObject(await this.storageService.sgetNode({ id: node.id }))
        // ノードがファイルの場合
        if (node.nodeType === StorageNodeType.File) {
          // ストレージに対象ファイルが存在することを検証
          const { exists } = await this.storageService.getStorageFile(node.id)
          expect(exists).toBeTruthy()
        }
      })
    )
  }

  /**
   * 指定されたノードが存在しないことを検証します。
   * @param nodes
   */
  async notExistsNodes(nodes: CoreStorageNode[]): Promise<void> {
    await Promise.all(
      nodes.map(async node => {
        // node.path が ｢node.dir + node.name｣ と一致することを検証
        expect(node.path).toBe(_path.join(node.dir, node.name))
        // バージョンの検証
        expect(node.version >= 1).toBeTruthy()
        // タイムスタンプの検証
        expect(dayjs.isDayjs(node.createdAt)).toBeTruthy()
        expect(dayjs.isDayjs(node.updatedAt)).toBeTruthy()
        // ストアに対象ノードが存在しないことを確認
        expect(await this.storageService.getNode({ path: node.path })).toBeUndefined()
        expect(await this.storageService.getNode({ id: node.id })).toBeUndefined()
        // ノードがファイルの場合
        if (node.nodeType === StorageNodeType.File) {
          // ストレージに対象ファイルが存在しないことを検証
          const fileDetail = await this.storageService.getStorageFile(node.id)
          expect(fileDetail.exists).toBeFalsy()
        }
      })
    )
  }

  /**
   * 移動ノードの検証を行います。
   * @param fromNodes 移動前ノード ※移動する前に取得しておいたノード
   * @param toNodePath 移動後ノードのパス
   */
  async verifyMoveNodes(fromNodes: CoreStorageNode[], toNodePath: string) {
    CoreStorageService.sortNodes(fromNodes)
    const fromNodePath = fromNodes[0].path
    const client = newElasticClient()

    await Promise.all(
      fromNodes.map(async fromNode => {
        const reg = new RegExp(`^${fromNodePath}`)
        const newNodePath = fromNode.path.replace(reg, toNodePath)
        const toNode = await this.storageService.sgetNode({ path: newNodePath })

        // 移動後ノードが存在することを検証
        if (!toNode) {
          throw new Error(`The destination node does not exist: '${newNodePath}'`)
        }
        if (toNode.nodeType === StorageNodeType.File) {
          const { exists, file } = await this.storageService.getStorageFile(toNode.id)
          expect(exists).toBeTruthy()
        }

        // 移動後ノードが複数存在しないことを検証
        const toNodeCountResponse = await client.count({
          index: CoreStorageSchema.IndexAlias,
          body: {
            query: {
              term: { path: toNode.path },
            },
          },
        })
        expect(toNodeCountResponse.body.count).toBe(1)

        // 移動前と移動後のストアノードを比較検証
        expect(toNode.share).toEqual(fromNode.share)
        expect(toNode.createdAt).toEqual(fromNode.createdAt)
        expect(toNode.updatedAt).toEqual(fromNode.updatedAt)
        expect(toNode.version).toBe(fromNode.version + 1)

        // 移動前ノードが存在しないことを検証
        const fromNode_fetched = await this.storageService.getNode({ path: fromNode.path })
        expect(fromNode_fetched).toBeUndefined()
      })
    )

    // ストレージにあるファイルが迷子になっていないか検証
    // ※削除されるべきファイルが削除されず、ストレージにファイルはあるが、
    //   データベースに対象ノードが存在しないという状況がないか検証。
    const bucket = admin.storage().bucket()
    const [files] = await bucket.getFiles()
    await Promise.all(
      files.map(async file => {
        const nodeId = file.name
        const node = await this.storageService.getNode({ id: nodeId })
        expect(node?.id).toBe(nodeId)
      })
    )
  }

  newDirNode(dirPath: string, data?: Partial<Omit<CoreStorageNode, 'name' | 'dir' | 'path' | 'nodeType'>>): CoreStorageNode {
    dirPath = removeBothEndsSlash(dirPath)
    data = data || {}
    const name = _path.basename(dirPath)
    const dir = removeStartDirChars(_path.dirname(dirPath))
    const result: CoreStorageNode = {
      id: data.id || CoreStorageSchema.generateNodeId(),
      nodeType: StorageNodeType.Dir,
      name,
      dir,
      path: dirPath,
      level: CoreStorageSchema.getNodeLevel(dirPath),
      contentType: data.contentType || '',
      size: data.size || 0,
      share: data.share || { isPublic: null, readUIds: null, writeUIds: null },
      version: 1,
      createdAt: data.createdAt || dayjs(),
      updatedAt: data.updatedAt || dayjs(),
    }
    return result
  }

  newFileNode(filePath: string, data?: Partial<Omit<CoreStorageNode, 'name' | 'dir' | 'path' | 'nodeType'>>): CoreStorageNode {
    filePath = removeBothEndsSlash(filePath)
    data = data || {}
    const name = _path.basename(filePath)
    const dir = removeStartDirChars(_path.dirname(filePath))
    const result: CoreStorageNode = {
      id: data.id || CoreStorageSchema.generateNodeId(),
      nodeType: StorageNodeType.File,
      name,
      dir,
      path: filePath,
      level: CoreStorageSchema.getNodeLevel(filePath),
      contentType: data.contentType || 'text/plain; charset=utf-8',
      size: data.size || 5,
      share: data.share || { isPublic: null, readUIds: null, writeUIds: null },
      version: 1,
      createdAt: data.createdAt || dayjs(),
      updatedAt: data.updatedAt || dayjs(),
    }
    return result
  }
}

class StorageTestHelper extends CoreStorageTestHelper {
  constructor(protected storageService: StorageTestService) {
    super(storageService)
  }

  newDirNode(dirPath: string, data?: Partial<Omit<StorageNode, 'name' | 'dir' | 'path' | 'nodeType'>>): StorageNode {
    dirPath = removeBothEndsSlash(dirPath)
    data = data || {}

    const result: StorageNode = { ...super.newDirNode(dirPath, data) }
    if (data.article) {
      result.id = _path.basename(dirPath)
      result.article = data.article
    }

    return result
  }

  newFileNode(filePath: string, data?: Partial<Omit<StorageNode, 'name' | 'dir' | 'path' | 'nodeType'>>): StorageNode {
    filePath = removeBothEndsSlash(filePath)
    data = data || {}

    const result: StorageNode = { ...super.newFileNode(filePath, data) }
    data.article && (result.article = data.article)

    return result
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export { CoreStorageTestHelper, CoreStorageTestService, StorageTestHelper, StorageTestService }
