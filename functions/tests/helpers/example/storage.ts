import { StorageArticleNodeType, StorageNode } from '../../../src/example/services/store'
import { newTestStorageDirNode as _newTestStorageDirNode, newTestStorageFileNode as _newTestStorageFileNode } from '../lib/storage'
import { removeBothEndsSlash } from 'web-base-lib'

//========================================================================
//
//  Interfaces
//
//========================================================================

interface ResponseStorageNode
  extends Omit<StorageNode, 'level' | 'articleNodeName' | 'articleNodeType' | 'articleSortOrder' | 'createdAt' | 'updatedAt'> {
  articleNodeName?: string | null
  articleNodeType?: StorageArticleNodeType | null
  articleSortOrder?: number | null
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

  return {
    ..._newTestStorageDirNode(dirPath, data),
    articleNodeType: data.articleNodeType,
    articleSortOrder: data.articleSortOrder,
  }
}

function newTestStorageFileNode(filePath: string, data?: Partial<Omit<StorageNode, 'name' | 'dir' | 'path' | 'nodeType'>>): StorageNode {
  filePath = removeBothEndsSlash(filePath)
  data = data || {}

  return {
    ..._newTestStorageFileNode(filePath, data),
    articleNodeType: data.articleNodeType,
    articleSortOrder: data.articleSortOrder,
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
    articleNodeName: node.articleNodeName ?? null,
    articleNodeType: node.articleNodeType ?? null,
    articleSortOrder: node.articleSortOrder ?? null,
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

export { newTestStorageDirNode, newTestStorageFileNode, toGQLResponseStorageNode, toGQLResponseStorageNodes }
