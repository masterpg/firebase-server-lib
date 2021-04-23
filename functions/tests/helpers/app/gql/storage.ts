import { ArticleDetail, ArticleListItem, ArticleSrcDetail, ArticleTableOfContentsItem, StorageNode } from '../../../../src/app/services'
import { ToDeepRawDate, ToStrictDeepNull, toRawDate } from 'web-base-lib'

//========================================================================
//
//  Interfaces
//
//========================================================================

type ToGQLResponse<T> = ToStrictDeepNull<ToDeepRawDate<T>>

type ResponseStorageNode = ToGQLResponse<StorageNode>

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
      type
      label {
        ja
        en
      }
      sortOrder
      src {
        ja {
          srcContent
          draftContent
          searchContent
          createdAt
          updatedAt
        }
        en {
          srcContent
          draftContent
          searchContent
          createdAt
          updatedAt
        }
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
    dir { id label }
    path { id label }
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
    dir { id label }
    path { id label }
    label
  }
`

//========================================================================
//
//  Implements
//
//========================================================================

function toGQLResponseStorageNode(node: StorageNode): ResponseStorageNode {
  function toArticle(articleDetail?: ArticleDetail): ToGQLResponse<ArticleDetail> | null {
    function toSrc(srcDetail?: ArticleSrcDetail): ToGQLResponse<ArticleSrcDetail> | null {
      if (!srcDetail) return null
      return {
        srcContent: srcDetail?.srcContent ?? null,
        draftContent: srcDetail?.draftContent ?? null,
        searchContent: srcDetail?.searchContent ?? null,
        createdAt: toRawDate(srcDetail?.createdAt) ?? null,
        updatedAt: toRawDate(srcDetail?.updatedAt) ?? null,
      }
    }

    if (!articleDetail) return null
    return {
      type: articleDetail.type,
      sortOrder: articleDetail.sortOrder,
      label: {
        ja: articleDetail.label.ja ?? null,
        en: articleDetail.label.en ?? null,
      },
      src: (() => {
        if (!articleDetail?.src) return null
        return {
          ja: toSrc(articleDetail.src.ja),
          en: toSrc(articleDetail.src.en),
        }
      })(),
    }
  }

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
    article: toArticle(node.article),
    version: node.version,
    createdAt: node.createdAt.toISOString(),
    updatedAt: node.updatedAt.toISOString(),
  }
}

function toGQLResponseStorageNodes(nodes: StorageNode[]): ResponseStorageNode[] {
  return nodes.map(node => toGQLResponseStorageNode(node))
}

function toGQLResponseArticleListItem(item: ArticleListItem): ToDeepRawDate<ArticleListItem> {
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

function toGQLResponseArticleListItems(items: ArticleListItem[]): ToDeepRawDate<ArticleListItem>[] {
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
