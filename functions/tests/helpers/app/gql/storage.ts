import { StorageArticleNodeType, StorageNode } from '../../../../src/app/services'

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
//  Implements
//
//========================================================================

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
    isArticleFile: node.isArticleFile ?? null,
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

export { toGQLResponseStorageNode, toGQLResponseStorageNodes }
