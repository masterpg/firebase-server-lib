import { StorageArticleDirSettings, StorageArticleFileSettings, StorageArticleSettings, StorageNode } from '../../../../src/app/services'

//========================================================================
//
//  Interfaces
//
//========================================================================

interface ResponseStorageNode extends Omit<StorageNode, 'level' | 'article' | 'createdAt' | 'updatedAt'> {
  article: {
    dir: StorageArticleDirSettings | null
    file: StorageArticleFileSettings | null
  } | null
  createdAt: string
  updatedAt: string
}

const StorageNodeFieldsName = 'StorageNodeFields'

const StorageNodeFields = `
  fragment ${StorageNodeFieldsName} on StorageNode {
    id
    nodeType
    name
    dir
    path
    contentType
    size
    share {
      isPublic
      readUIds
      writeUIds
    }
    article {
      dir {
        name
        type
        sortOrder
      }
      file {
        type
        content
      }
    }
    version
    createdAt
    updatedAt
  }
`

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
    article: (() => {
      if (!node.article) return null
      return {
        dir: node.article.dir ?? null,
        file: node.article.file ?? null,
      }
    })(),
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

export { StorageNodeFieldsName, StorageNodeFields, toGQLResponseStorageNode, toGQLResponseStorageNodes }
