import {
  ArticleListItem,
  ArticleTableOfContentsItem,
  StorageArticleDirDetail,
  StorageArticleSrcDetail,
  StorageNode,
} from '../../../../src/app/services'
import { ToRawTimestamp, toRawTimestamp } from 'web-base-lib'

//========================================================================
//
//  Interfaces
//
//========================================================================

interface ResponseStorageNode extends Omit<StorageNode, 'level' | 'article' | 'createdAt' | 'updatedAt'> {
  article: {
    dir: StorageArticleDirDetail | null
    src: ToRawTimestamp<StorageArticleSrcDetail> | null
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
        label
        type
        sortOrder
      }
      file {
        type
      }
      src {
        masterId
        draftId
        createdAt
        updatedAt
      }
    }
    version
    createdAt
    updatedAt
  }
`

const ArticleListItemFieldsName = 'ArticleListItemFields'

const ArticleListItemFields = `
  fragment ${ArticleListItemFieldsName} on ArticleListItem {
    id
    name
    dir
    path
    label
    createdAt
    updatedAt
  }
`

const ArticleTableOfContentsItemFieldsName = 'ArticleTableOfContentsItemFields'

const ArticleTableOfContentsItemFields = `
  fragment ${ArticleTableOfContentsItemFieldsName} on ArticleTableOfContentsItem {
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
        file: node.article.file ?? null,
        src: toRawTimestamp(node.article.src) ?? null,
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

function toGQLResponseArticleListItem(item: ArticleListItem): ToRawTimestamp<ArticleListItem> {
  return {
    id: item.id,
    name: item.name,
    dir: item.dir,
    path: item.path,
    label: item.label,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }
}

function toGQLResponseArticleListItems(items: ArticleListItem[]): ToRawTimestamp<ArticleListItem>[] {
  return items.map(item => toGQLResponseArticleListItem(item))
}

function toGQLResponseArticleTableOfContentsItem(item: ArticleTableOfContentsItem): ArticleTableOfContentsItem {
  return {
    id: item.id,
    type: item.type,
    name: item.name,
    dir: item.dir,
    path: item.path,
    label: item.label,
  }
}

function toGQLResponseArticleTableOfContentsItems(items: ArticleTableOfContentsItem[]): ArticleTableOfContentsItem[] {
  return items.map(item => toGQLResponseArticleTableOfContentsItem(item))
}

//========================================================================
//
//  Exports
//
//========================================================================

export {
  ArticleListItemFields,
  ArticleListItemFieldsName,
  ArticleTableOfContentsItemFields,
  ArticleTableOfContentsItemFieldsName,
  StorageNodeFields,
  StorageNodeFieldsName,
  toGQLResponseArticleListItem,
  toGQLResponseArticleListItems,
  toGQLResponseArticleTableOfContentsItem,
  toGQLResponseArticleTableOfContentsItems,
  toGQLResponseStorageNode,
  toGQLResponseStorageNodes,
}
