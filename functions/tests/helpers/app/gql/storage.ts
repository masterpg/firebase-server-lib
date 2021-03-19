import { ArticleTableOfContentsNode, StorageArticleDirDetail, StorageArticleSrcDetail, StorageNode } from '../../../../src/app/services'

//========================================================================
//
//  Interfaces
//
//========================================================================

interface ResponseStorageNode extends Omit<StorageNode, 'level' | 'article' | 'createdAt' | 'updatedAt'> {
  article: {
    dir: StorageArticleDirDetail | null
    src: StorageArticleSrcDetail | null
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
      src {
        type
      }
    }
    version
    createdAt
    updatedAt
  }
`

interface ResponseArticleTableOfContentsNode extends ArticleTableOfContentsNode {}

const ArticleTableOfContentsNodeFieldsName = 'ArticleTableOfContentsNodeFields'

const ArticleTableOfContentsNodeFields = `
  fragment ${ArticleTableOfContentsNodeFieldsName} on ArticleTableOfContentsNode {
    id
    type
    name
    dir
    path
    label
  }
`

//========================================================================
//
//  Implements
//
//========================================================================

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
        src: node.article.src ?? null,
      }
    })(),
    version: node.version,
    createdAt: node.createdAt.toISOString(),
    updatedAt: node.updatedAt.toISOString(),
  }
}

function toGQLResponseStorageNodes(nodes: StorageNode[]): ResponseStorageNode[] {
  return nodes.map(node => toGQLResponseStorageNode(node))
}

function toGQLResponseArticleTableOfContentsNode(node: ArticleTableOfContentsNode): ResponseArticleTableOfContentsNode {
  return {
    id: node.id,
    type: node.type,
    name: node.name,
    dir: node.dir,
    path: node.path,
    label: node.label,
  }
}

function toGQLResponseArticleTableOfContentsNodes(nodes: ArticleTableOfContentsNode[]): ResponseArticleTableOfContentsNode[] {
  return nodes.map(node => toGQLResponseArticleTableOfContentsNode(node))
}

//========================================================================
//
//  Exports
//
//========================================================================

export {
  ArticleTableOfContentsNodeFields,
  ArticleTableOfContentsNodeFieldsName,
  StorageNodeFields,
  StorageNodeFieldsName,
  toGQLResponseArticleTableOfContentsNode,
  toGQLResponseArticleTableOfContentsNodes,
  toGQLResponseStorageNode,
  toGQLResponseStorageNodes,
}
