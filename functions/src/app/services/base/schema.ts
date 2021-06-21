import * as _path from 'path'
import { ArticleSrcByLang, ArticleTag, CoreStorageNode, StorageNode, StorageNodeShareDetailInput, User } from './index'
import { BaseIndexDefinitions, ElasticMSearchAPIResponse, ElasticSearchAPIResponse, ElasticSearchHit, ElasticSearchResponseOrHits } from './elastic'
import {
  DeepPartial,
  Entities,
  LangCodes,
  ToDeepEntityDateAre,
  ToDeepNullable,
  ToDeepRawDate,
  pickProps,
  removeBothEndsSlash,
  removeStartDirChars,
  toDeepEntityDate,
  toDeepRawDate,
  toRawDate,
} from 'web-base-lib'
import { config } from '../../../config'
import { generateEntityId } from '../../base'
import { merge } from 'lodash'
const { TimestampEntityProps, keyword_lower, kuromoji_analyzer, kuromoji_html_analyzer, suggest_analysis, whitespace_remove } = BaseIndexDefinitions

//========================================================================
//
//  Interfaces
//
//========================================================================

type OmitEntity<T> = Omit<T, 'id' | 'version'>

type ToDocParam<ENTITY> = ToDeepNullable<OmitEntity<ENTITY>>

type ToDoc<ENTITY> = ToDeepRawDate<OmitEntity<ENTITY>>

type ToEntity<DOC> = ToDeepEntityDateAre<DOC & { id: string; version: number }, 'createdAt' | 'updatedAt'>

//========================================================================
//
//  Implementation
//
//========================================================================

function hitToEntity<DOC>(hit: ElasticSearchHit<DOC>): ToEntity<DOC> {
  return toDeepEntityDate(
    {
      id: hit._id,
      version: hit._version ?? 0,
      ...hit._source,
    },
    ['createdAt', 'updatedAt']
  )
}

function entityToDoc<ENTITY>(entity: ENTITY): ToDoc<ENTITY> {
  const _entity = { ...entity }
  delete (_entity as any).id
  delete (_entity as any).version
  return toDeepRawDate(_entity)
}

/**
 * データベースレスポンスから取得したエンティティデータを取り出し、アプリケーションで扱われる形式へ変換します。
 * @param response_or_hits
 * @param convertor
 */
function dbResponseToEntities<ENTITY, DOC>(
  response_or_hits: ElasticSearchResponseOrHits<DOC>,
  convertor: (hit: ElasticSearchHit<DOC>) => ENTITY
): ENTITY[] {
  if (Array.isArray(response_or_hits)) {
    const hits: ElasticSearchHit<DOC>[] = response_or_hits
    return hits.map(hit => convertor(hit))
  }
  // Multi search APIのレスポンスの場合
  else if ((response_or_hits as ElasticMSearchAPIResponse<DOC>).body.responses) {
    const multiAPIResponse = response_or_hits as ElasticMSearchAPIResponse<DOC>
    const nodes: ENTITY[] = []
    for (const response of multiAPIResponse.body.responses) {
      if (!response.hits.hits.length) continue
      nodes.push(...response.hits.hits.map(hit => convertor(hit)))
    }
    return nodes
  }
  // Single search APIのレスポンスの場合
  else {
    const singleAPIResponse = response_or_hits as ElasticSearchAPIResponse<DOC>
    if (!singleAPIResponse.body.hits.hits.length) return []
    return singleAPIResponse.body.hits.hits.map(hit => convertor(hit))
  }
}

namespace UserSchema {
  export const IndexAliases = {
    prod: `${Entities.Users.Name}`,
    dev: `${Entities.Users.Name}`,
    test: `${Entities.Users.Name}-test`,
  }

  export const IndexAlias = IndexAliases[config.env.mode]

  export const IndexDefinition = {
    settings: {
      analysis: {
        analyzer: {
          kuromoji_analyzer,
        },
        normalizer: {
          keyword_lower,
        },
      },
    },
    mappings: {
      properties: {
        ...TimestampEntityProps,
        userName: {
          type: 'keyword',
          normalizer: 'keyword_lower',
        },
        fullName: {
          type: 'keyword',
          fields: {
            text: {
              type: 'text',
              analyzer: 'kuromoji_analyzer',
            },
          },
        },
        isAppAdmin: {
          type: 'boolean',
        },
        photoURL: {
          type: 'keyword',
        },
      },
    },
  }

  export interface DocUser extends ToDoc<Omit<User, 'email' | 'emailVerified'>> {}

  export const toDoc = <ENTITY extends ToDocParam<Omit<User, 'email' | 'emailVerified'>>>(entity: ENTITY) => {
    const _entity = pickProps(entity, ['userName', 'fullName', 'isAppAdmin', 'photoURL', 'createdAt', 'updatedAt'])
    return entityToDoc(_entity)
  }

  export const toEntity = <DOC extends DeepPartial<DocUser>>(hit: ElasticSearchHit<DOC>) => {
    return hitToEntity(hit)
  }

  export function toEntities<DOC extends DeepPartial<DocUser>>(response_or_hits: ElasticSearchResponseOrHits<DOC>): ToEntity<DOC>[] {
    return dbResponseToEntities(response_or_hits, toEntity)
  }
}

namespace CoreStorageSchema {
  export const IndexAliases = {
    prod: `${Entities.StorageNodes.Name}`,
    dev: `${Entities.StorageNodes.Name}`,
    test: `${Entities.StorageNodes.Name}-test`,
  }

  export const IndexAlias = CoreStorageSchema.IndexAliases[config.env.mode]

  export const IndexDefinition = {
    settings: {
      analysis: {
        analyzer: {
          kuromoji_analyzer,
          kuromoji_html_analyzer,
        },
      },
    },
    mappings: {
      properties: {
        ...TimestampEntityProps,
        nodeType: {
          type: 'keyword',
        },
        name: {
          type: 'keyword',
          fields: {
            text: {
              type: 'text',
              analyzer: 'kuromoji_analyzer',
            },
          },
        },
        dir: {
          type: 'keyword',
          fields: {
            text: {
              type: 'text',
              analyzer: 'kuromoji_analyzer',
            },
          },
        },
        path: {
          type: 'keyword',
          fields: {
            text: {
              type: 'text',
              analyzer: 'kuromoji_analyzer',
            },
          },
        },
        contentType: {
          type: 'keyword',
        },
        size: {
          type: 'long',
        },
        share: {
          properties: {
            isPublic: {
              type: 'boolean',
            },
            readUIds: {
              type: 'keyword',
            },
            writeUIds: {
              type: 'keyword',
            },
          },
        },
      },
    },
  }

  export interface DocCoreStorageNode extends ToDoc<CoreStorageNode> {}

  export const toDoc = <ENTITY extends ToDocParam<CoreStorageNode>>(entity: ENTITY) => {
    const _entity = pickProps(entity, ['nodeType', 'name', 'dir', 'path', 'contentType', 'size', 'share', 'createdAt', 'updatedAt'])
    return entityToDoc(_entity)
  }

  export function toEntity<DOC extends DeepPartial<DocCoreStorageNode>>(hit: ElasticSearchHit<DOC>): ToEntity<DOC> {
    const entity: ReturnType<typeof toEntity> = hitToEntity(hit)

    // ---> nullをundefinedに変換する
    entity.share ??= {}
    entity.share.isPublic ??= undefined
    entity.share.readUIds ??= undefined
    entity.share.writeUIds ??= undefined
    // <---

    return entity as ToEntity<DOC>
  }

  export function toEntities<DOC extends DeepPartial<DocCoreStorageNode>>(
    response_or_hits: ElasticSearchResponseOrHits<DOC> | ElasticMSearchAPIResponse<DOC>
  ): ToEntity<DOC>[] {
    return dbResponseToEntities(response_or_hits, toEntity)
  }

  /**
   * ノードIDを生成します。
   */
  export function generateId(): string {
    return generateEntityId(IndexAlias)
  }

  /**
   * ノードレベルを取得します。
   * @param nodePath
   */
  export function getNodeLevel(nodePath: string | null): number {
    nodePath = removeBothEndsSlash(nodePath)
    return nodePath.split('/').length
  }

  /**
   * 指定されたノードパスをノードデータに変換します。
   * @param nodePath
   */
  export function toPathData(nodePath: string): { name: string; dir: string; path: string } {
    nodePath = removeBothEndsSlash(nodePath)
    return {
      name: _path.basename(nodePath),
      dir: removeStartDirChars(_path.dirname(nodePath)),
      path: nodePath,
    }
  }

  /**
   * 空の共有設定を生成します。
   */
  export function EmptyShareDetail(): StorageNodeShareDetailInput {
    return {
      isPublic: null,
      readUIds: null,
      writeUIds: null,
    }
  }
}

namespace StorageSchema {
  export const IndexAliases = CoreStorageSchema.IndexAliases

  export const IndexAlias = StorageSchema.IndexAliases[config.env.mode]

  export const IndexDefinition = merge(CoreStorageSchema.IndexDefinition, {
    settings: {
      analysis: {
        filter: {
          whitespace_remove,
        },
        analyzer: {
          tags_index_analyzer: {
            type: 'custom',
            tokenizer: 'keyword',
            filter: ['lowercase', 'whitespace_remove'],
          },
          tags_search_analyzer: {
            type: 'custom',
            tokenizer: 'whitespace',
            filter: ['lowercase', 'whitespace_remove'],
          },
        },
      },
    },
    mappings: {
      properties: {
        article: {
          properties: {
            type: {
              type: 'keyword',
            },
            label: {
              properties: {
                ja: {
                  type: 'keyword',
                  fields: {
                    text: {
                      type: 'text',
                      analyzer: 'kuromoji_analyzer',
                    },
                  },
                },
                en: {
                  type: 'keyword',
                  fields: {
                    text: {
                      type: 'text',
                      analyzer: 'standard',
                    },
                  },
                },
              },
            },
            sortOrder: {
              type: 'long',
            },
            src: {
              properties: {
                ja: {
                  properties: {
                    srcContent: {
                      type: 'text',
                      analyzer: 'kuromoji_analyzer',
                    },
                    draftContent: {
                      type: 'text',
                      analyzer: 'kuromoji_analyzer',
                    },
                    searchContent: {
                      type: 'text',
                      analyzer: 'kuromoji_analyzer',
                    },
                    srcTags: {
                      type: 'text',
                      analyzer: 'tags_index_analyzer',
                      search_analyzer: 'tags_search_analyzer',
                    },
                    draftTags: {
                      type: 'text',
                      analyzer: 'tags_index_analyzer',
                      search_analyzer: 'tags_search_analyzer',
                    },
                    createdAt: {
                      type: 'date',
                    },
                    updatedAt: {
                      type: 'date',
                    },
                  },
                },
                en: {
                  properties: {
                    srcContent: {
                      type: 'text',
                      analyzer: 'standard',
                    },
                    draftContent: {
                      type: 'text',
                      analyzer: 'standard',
                    },
                    searchContent: {
                      type: 'text',
                      analyzer: 'standard',
                    },
                    srcTags: {
                      type: 'text',
                      analyzer: 'tags_index_analyzer',
                      search_analyzer: 'tags_search_analyzer',
                    },
                    draftTags: {
                      type: 'text',
                      analyzer: 'tags_index_analyzer',
                      search_analyzer: 'tags_search_analyzer',
                    },
                    createdAt: {
                      type: 'date',
                    },
                    updatedAt: {
                      type: 'date',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  export type DocStorageNode = ToDoc<StorageNode>

  export function toDoc<ENTITY extends ToDocParam<StorageNode>>(entity: ENTITY): ToDoc<ENTITY> {
    const doc: ReturnType<typeof toDoc> = CoreStorageSchema.toDoc(entity)

    if (entity.article) {
      doc.article = {
        ...pickProps(entity.article, ['type', 'label', 'sortOrder']),
      }
      if (entity.article.src) {
        doc.article.src = LangCodes.reduce((result, langCode) => {
          const srcDetail = entity.article!.src![langCode]
          if (srcDetail) {
            result[langCode] = {
              ...pickProps(srcDetail, ['srcContent', 'draftContent', 'searchContent', 'srcTags', 'draftTags']),
              createdAt: toRawDate(srcDetail.createdAt),
              updatedAt: toRawDate(srcDetail.updatedAt),
            }
          }
          return result
        }, {} as ToDeepRawDate<ToDeepNullable<ArticleSrcByLang>>)
      }
    }

    return doc as ToDoc<ENTITY>
  }

  export function toEntity<DOC extends DeepPartial<DocStorageNode>>(hit: ElasticSearchHit<DOC>): ToEntity<DOC> {
    const entity: ReturnType<typeof toEntity> = CoreStorageSchema.toEntity(hit)

    if (entity.article?.src) {
      for (const langCode of LangCodes) {
        const srcDetail = entity.article?.src?.[langCode]
        if (srcDetail) {
          // ---> nullをundefinedに変換する
          srcDetail.srcContent = srcDetail.srcContent ?? undefined
          srcDetail.draftContent = srcDetail.draftContent ?? undefined
          srcDetail.searchContent = srcDetail.searchContent ?? undefined
          // <---
          // ---> nullまたは空配列はundefinedに変換する
          srcDetail.srcTags = !srcDetail.srcTags || !srcDetail.srcTags.length ? undefined : srcDetail.srcTags
          srcDetail.draftTags = !srcDetail.draftTags || !srcDetail.draftTags.length ? undefined : srcDetail.draftTags
          // <---
        }
      }
    }

    return entity as ToEntity<DOC>
  }

  export function toEntities<DOC extends DeepPartial<DocStorageNode>>(
    response_or_hits: ElasticSearchResponseOrHits<DOC> | ElasticMSearchAPIResponse<DOC>
  ): ToEntity<DOC>[] {
    return dbResponseToEntities(response_or_hits, toEntity)
  }

  export import generateId = CoreStorageSchema.generateId

  export import getNodeLevel = CoreStorageSchema.getNodeLevel

  export import toPathData = CoreStorageSchema.toPathData

  export import EmptyShareDetail = CoreStorageSchema.EmptyShareDetail
}

namespace ArticleTagSchema {
  export const IndexAliases = {
    prod: `${Entities.ArticleTag.Name}`,
    dev: `${Entities.ArticleTag.Name}`,
    test: `${Entities.ArticleTag.Name}-test`,
  }

  export const IndexAlias = IndexAliases[config.env.mode]

  export const IndexDefinition = {
    settings: {
      analysis: merge(
        { ...suggest_analysis },
        {
          normalizer: {
            keyword_lower,
          },
        }
      ),
    },
    mappings: {
      properties: {
        ...TimestampEntityProps,
        name: {
          type: 'keyword',
          normalizer: 'keyword_lower',
          fields: {
            suggest: {
              type: 'text',
              analyzer: 'suggest_index_analyzer',
              search_analyzer: 'suggest_search_analyzer',
            },
            readingform: {
              type: 'text',
              analyzer: 'readingform_index_analyzer',
              search_analyzer: 'readingform_search_analyzer',
            },
          },
        },
        usedCount: {
          type: 'integer',
        },
      },
    },
  }

  export interface DocArticleTag extends ToDoc<ArticleTag> {}

  export const toDoc = <ENTITY extends ToDocParam<ArticleTag>>(appEntity: ENTITY) => {
    const _entity = pickProps(appEntity, ['name', 'usedCount', 'createdAt', 'updatedAt'])
    return entityToDoc(_entity)
  }

  export const toEntity = <DOC extends DeepPartial<DocArticleTag>>(hit: ElasticSearchHit<DOC>) => {
    return hitToEntity(hit)
  }

  export function toEntities<DOC extends DeepPartial<DocArticleTag>>(
    response_or_hits: ElasticSearchResponseOrHits<DOC> | ElasticMSearchAPIResponse<DOC>
  ): ToEntity<DOC>[] {
    return dbResponseToEntities(response_or_hits, toEntity)
  }

  export function generateId(): string {
    return generateEntityId(IndexAlias)
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export { UserSchema, CoreStorageSchema, StorageSchema, ArticleTagSchema, dbResponseToEntities }
