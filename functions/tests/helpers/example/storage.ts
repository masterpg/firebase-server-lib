import { StorageDocBundleType, StorageNode } from '../../../src/example/services/store'
import { newTestStorageDirNode as _newTestStorageDirNode, newTestStorageFileNode as _newTestStorageFileNode } from '../lib/storage'
import { removeBothEndsSlash } from 'web-base-lib'

//========================================================================
//
//  Interfaces
//
//========================================================================

interface ResponseStorageNode extends Omit<StorageNode, 'level' | 'docBundleType' | 'isDoc' | 'docSortOrder' | 'createdAt' | 'updatedAt'> {
  docBundleType?: StorageDocBundleType | null
  isDoc?: boolean | null
  docSortOrder?: number | null
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
    docBundleType: data.docBundleType,
    isDoc: data.isDoc,
    docSortOrder: data.docSortOrder,
  }
}

function newTestStorageFileNode(filePath: string, data?: Partial<Omit<StorageNode, 'name' | 'dir' | 'path' | 'nodeType'>>): StorageNode {
  filePath = removeBothEndsSlash(filePath)
  data = data || {}

  return {
    ..._newTestStorageFileNode(filePath, data),
    docBundleType: data.docBundleType,
    isDoc: data.isDoc,
    docSortOrder: data.docSortOrder,
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
    docBundleType: node.docBundleType ?? null,
    isDoc: node.isDoc ?? null,
    docSortOrder: node.docSortOrder ?? null,
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
