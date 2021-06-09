import { toDeepNull, toDeepRawDate } from 'web-base-lib'

//========================================================================
//
//  Interfaces
//
//========================================================================

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
    sortOrder
  }
`

//========================================================================
//
//  Implements
//
//========================================================================

const toGQLResponse = <T>(entity_or_entities: T) => {
  return toDeepNull(toDeepRawDate(entity_or_entities))
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
  toGQLResponse,
}
