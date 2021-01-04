import * as admin from 'firebase-admin'
import * as path from 'path'
import { AppStorageService, AppStorageServiceDI, StorageNode, StorageNodeType } from '../../../../src/app/services'
import { removeBothEndsSlash, removeStartDirChars } from 'web-base-lib'
import { StorageService } from '../../../../src/app/services/base/storage'
import dayjs = require('dayjs')
import { newElasticClient } from '../../../../src/app/base/elastic'

//========================================================================
//
//  Interfaces
//
//========================================================================

type StorageTestService = StorageService & {
  extractMetaData: StorageService['extractMetaData']
  saveGCSMetadata: StorageService['saveGCSMetadata']
  m_validateAccessibleTargetToNodePaths: AppStorageServiceDI.type['m_validateAccessibleTargetToNodePaths']
}

type AppStorageTestService = AppStorageService &
  StorageTestService & {
    m_validateArticleRootUnder: AppStorageServiceDI.type['m_validateArticleRootUnder']
    m_getBelongToArticleBundle: AppStorageServiceDI.type['m_getBelongToArticleBundle']
  }

//========================================================================
//
//  Implementation
//
//========================================================================

class StorageTestHelper {
  constructor(protected storageService: StorageTestService) {}

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
      index: StorageService.IndexAlias,
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
  async existsNodes(nodes: StorageNode[]): Promise<void> {
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
      // データベースに対象ノードが存在することを確認
      expect(node).toMatchObject(await this.storageService.sgetNode({ path: node.path }))
      expect(node).toMatchObject(await this.storageService.sgetNode({ id: node.id }))
      // ノードがファイルの場合
      if (node.nodeType === StorageNodeType.File) {
        // ストレージに対象ファイルが存在することを検証
        const { exists, metadata } = await this.storageService.getStorageFile(node.id)
        expect(exists).toBeTruthy()
        // メタデータの検証
        if (StorageService.isUserRootUnder(node.path)) {
          const uid = StorageService.extractUId(node.path)
          expect(metadata.uid).toBe(uid)
        } else {
          expect(metadata.uid).toBeNull()
        }
        expect(metadata.isPublic).toBe(node.share.isPublic)
        expect(metadata.readUIds).toEqual(node.share.readUIds)
        expect(metadata.writeUIds).toEqual(node.share.writeUIds)
      }
    }
  }

  /**
   * 指定されたノードが存在しないことを検証します。
   * @param nodes
   */
  async notExistsNodes(nodes: StorageNode[]): Promise<void> {
    for (const node of nodes) {
      // node.path が ｢node.dir + node.name｣ と一致することを検証
      expect(node.path).toBe(path.join(node.dir, node.name))
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
    }
  }

  /**
   * 移動ノードの検証を行います。
   * @param fromNodes 移動前ノード ※移動する前に取得しておいたノード
   * @param toNodePath 移動後ノードのパス
   */
  async verifyMoveNodes(fromNodes: StorageNode[], toNodePath: string) {
    StorageService.sortNodes(fromNodes)
    const fromNodePath = fromNodes[0].path
    const client = newElasticClient()

    for (const fromNode of fromNodes) {
      const reg = new RegExp(`^${fromNodePath}`)
      const newNodePath = fromNode.path.replace(reg, toNodePath)
      const toNode = await this.storageService.sgetNode({ path: newNodePath })

      // 移動後ノードが存在することを検証
      if (!toNode) {
        throw new Error(`The destination node does not exist: '${newNodePath}'`)
      }
      if (toNode.nodeType === StorageNodeType.File) {
        const { exists, file, metadata } = await this.storageService.getStorageFile(toNode.id)
        expect(exists).toBeTruthy()
        if (StorageService.isUserRootUnder(toNode.path)) {
          const uid = StorageService.extractUId(toNode.path)
          expect(metadata.uid).toBe(uid)
        } else {
          expect(metadata.uid).toBeNull()
        }
        expect(metadata.isPublic).toBe(toNode.share.isPublic)
        expect(metadata.readUIds).toEqual(toNode.share.readUIds)
        expect(metadata.writeUIds).toEqual(toNode.share.writeUIds)
      }

      // 移動後ノードが複数存在しないことを検証
      const toNodeCountResponse = await client.count({
        index: StorageService.IndexAlias,
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
    }

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

  newDirNode(dirPath: string, data?: Partial<Omit<StorageNode, 'name' | 'dir' | 'path' | 'nodeType'>>): StorageNode {
    dirPath = removeBothEndsSlash(dirPath)
    data = data || {}
    const name = path.basename(dirPath)
    const dir = removeStartDirChars(path.dirname(dirPath))
    const result: StorageNode = {
      id: data.id || StorageService.generateNodeId(),
      nodeType: StorageNodeType.Dir,
      name,
      dir,
      path: dirPath,
      level: StorageService.getNodeLevel(dirPath),
      contentType: data.contentType || '',
      size: data.size || 0,
      share: data.share || { isPublic: null, readUIds: null, writeUIds: null },
      articleNodeName: data.articleNodeName ?? null,
      articleNodeType: data.articleNodeType ?? null,
      articleSortOrder: data.articleSortOrder ?? null,
      isArticleFile: false,
      version: 1,
      createdAt: data.createdAt || dayjs(),
      updatedAt: data.updatedAt || dayjs(),
    }
    return result
  }

  newFileNode(filePath: string, data?: Partial<Omit<StorageNode, 'name' | 'dir' | 'path' | 'nodeType'>>): StorageNode {
    filePath = removeBothEndsSlash(filePath)
    data = data || {}
    const name = path.basename(filePath)
    const dir = removeStartDirChars(path.dirname(filePath))
    const result: StorageNode = {
      id: data.id || StorageService.generateNodeId(),
      nodeType: StorageNodeType.File,
      name,
      dir,
      path: filePath,
      level: StorageService.getNodeLevel(filePath),
      contentType: data.contentType || 'text/plain; charset=utf-8',
      size: data.size || 5,
      share: data.share || { isPublic: null, readUIds: null, writeUIds: null },
      articleNodeName: data.articleNodeName ?? null,
      articleNodeType: data.articleNodeType ?? null,
      articleSortOrder: data.articleSortOrder ?? null,
      isArticleFile: false,
      version: 1,
      createdAt: data.createdAt || dayjs(),
      updatedAt: data.updatedAt || dayjs(),
    }
    return result
  }
}

class AppStorageTestHelper extends StorageTestHelper {
  constructor(protected storageService: AppStorageTestService) {
    super(storageService)
  }

  newDirNode(dirPath: string, data?: Partial<Omit<StorageNode, 'name' | 'dir' | 'path' | 'nodeType'>>): StorageNode {
    dirPath = removeBothEndsSlash(dirPath)
    data = data || {}

    return {
      ...super.newDirNode(dirPath, data),
      articleNodeName: data.articleNodeName ?? null,
      articleNodeType: data.articleNodeType ?? null,
      articleSortOrder: data.articleSortOrder ?? null,
    }
  }

  newFileNode(filePath: string, data?: Partial<Omit<StorageNode, 'name' | 'dir' | 'path' | 'nodeType'>>): StorageNode {
    filePath = removeBothEndsSlash(filePath)
    data = data || {}

    return {
      ...super.newFileNode(filePath, data),
      articleNodeName: data.articleNodeName ?? null,
      articleNodeType: data.articleNodeType ?? null,
      articleSortOrder: data.articleSortOrder ?? null,
    }
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export { StorageTestHelper, StorageTestService, AppStorageTestHelper, AppStorageTestService }
