import * as _path from 'path'
import { ArticleSrcByLang, CoreStorageNode, StorageNode, StorageNodeShareDetail, User } from './index'
import { BaseIndexDefinitions, ElasticMSearchAPIResponse, ElasticSearchAPIResponse, ElasticSearchHit } from '../../base/elastic'
import {
  DeepPartial,
  Entities,
  LangCodes,
  ToDeepEntityDateAre,
  ToDeepRawDate,
  pickProps,
  removeBothEndsSlash,
  removeStartDirChars,
  toDeepEntityDate,
  toDeepRawDate,
  toEntityDate,
  toRawDate,
} from 'web-base-lib'
import { config } from '../../../config'
import { generateEntityId } from '../../base'
import { merge } from 'lodash'
const { keyword_lowercase, kuromoji_analyzer, kuromoji_html_analyzer, TimestampEntityProps } = BaseIndexDefinitions

//========================================================================
//
//  Interfaces
//
//========================================================================

type OmitEntity<T> = Omit<T, 'id' | 'version'>

type ToDocParam<T> = DeepPartial<OmitEntity<T>>

type ToDoc<T> = ToDeepRawDate<OmitEntity<T>>

type ToEntity<T> = ToDeepEntityDateAre<T & { id: string; version: number }, 'createdAt' | 'updatedAt'>

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

function entityToDoc<ENTITY>(entity: ENTITY): ToDeepRawDate<OmitEntity<ENTITY>> {
  const _entity = { ...entity }
  delete (_entity as any).id
  delete (_entity as any).version
  return toDeepRawDate(_entity)
}

/**
 * データベースレスポンスから取得したエンティティデータを取り出し、アプリケーションで扱われる形式へ変換します。
 * @param apiResponse
 * @param convertor
 */
function dbResponseToEntities<ENTITY, DOC>(
  apiResponse: ElasticSearchAPIResponse<DOC> | ElasticMSearchAPIResponse<DOC>,
  convertor: (hit: ElasticSearchHit<DOC>) => ENTITY
): ENTITY[] {
  // Multi search APIのレスポンスの場合
  if ((apiResponse as ElasticMSearchAPIResponse<DOC>).body.responses) {
    const multiAPIResponse = apiResponse as ElasticMSearchAPIResponse<DOC>
    const nodes: ENTITY[] = []
    for (const response of multiAPIResponse.body.responses) {
      if (!response.hits.hits.length) continue
      nodes.push(...response.hits.hits.map(hit => convertor(hit)))
    }
    return nodes
  }
  // Single search APIのレスポンスの場合
  else {
    const singleAPIResponse = apiResponse as ElasticSearchAPIResponse<DOC>
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
          keyword_lowercase,
        },
      },
    },
    mappings: {
      properties: {
        ...TimestampEntityProps,
        userName: {
          type: 'keyword',
          normalizer: 'keyword_lowercase',
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

  export interface UserDoc extends ToDoc<Omit<User, 'email' | 'emailVerified'>> {}

  export const toDoc = <ENTITY extends ToDocParam<Omit<User, 'email' | 'emailVerified'>>>(entity: ENTITY) => {
    const _entity = pickProps(entity, ['userName', 'fullName', 'isAppAdmin', 'photoURL', 'createdAt', 'updatedAt'])
    return entityToDoc(_entity)
  }

  export const toEntity = <DOC extends DeepPartial<UserDoc>>(hit: ElasticSearchHit<DOC>) => {
    return hitToEntity(hit)
  }

  export function toEntities<DOC extends DeepPartial<UserDoc>>(dbResponse: ElasticSearchAPIResponse<DOC>): ToEntity<DOC>[] {
    return dbResponseToEntities(dbResponse, toEntity)
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

  export const toEntity = <DOC extends DeepPartial<DocCoreStorageNode>>(hit: ElasticSearchHit<DOC>) => {
    return hitToEntity(hit)
  }

  export function toEntities<DOC extends DeepPartial<DocCoreStorageNode>>(
    dbResponse: ElasticSearchAPIResponse<DOC> | ElasticMSearchAPIResponse<DOC>
  ): ToEntity<DOC>[] {
    return dbResponseToEntities(dbResponse, toEntity)
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
  export function EmptyShareDetail(): StorageNodeShareDetail {
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

  export const toDoc = <ENTITY extends ToDocParam<StorageNode>>(entity: ENTITY) => {
    const doc: ToDoc<DeepPartial<StorageNode>> = CoreStorageSchema.toDoc(entity)
    if (entity.article) {
      doc.article = {
        ...pickProps(entity.article, ['type', 'label', 'sortOrder']),
      }
      if (entity.article.src) {
        doc.article.src = LangCodes.reduce((result, langCode) => {
          const srcDetail = entity.article!.src![langCode]
          if (srcDetail) {
            result[langCode] = {
              // ---> undefined or null は空文字に変換する
              ...(() => {
                const result = pickProps(srcDetail, ['srcContent', 'draftContent', 'searchContent']) // キーが存在するプロパティのみ抽出
                for (const [key, value] of Object.entries(result)) {
                  result[key as 'srcContent' | 'draftContent' | 'searchContent'] = value ?? ''
                }
                return result
              })(),
              // <---
              createdAt: toRawDate(srcDetail.createdAt),
              updatedAt: toRawDate(srcDetail.updatedAt),
            }
          }
          return result
        }, {} as ToDeepRawDate<ArticleSrcByLang>)
      }
    }
    return doc as ToDoc<ENTITY>
  }

  export const toEntity = <DOC extends DeepPartial<DocStorageNode>>(hit: ElasticSearchHit<DOC>) => {
    const doc = hit._source
    const entity: ToEntity<DeepPartial<DocStorageNode>> = CoreStorageSchema.toEntity(hit)

    if (doc.article) {
      entity.article = {
        ...pickProps(doc.article, ['type', 'label', 'sortOrder']),
      }
      if (doc.article.src) {
        entity.article.src = LangCodes.reduce((result, langCode) => {
          const srcDetail = doc.article?.src?.[langCode]
          if (srcDetail) {
            result[langCode] = {
              // ---> 空文字はundefinedに変換する
              srcContent: srcDetail.srcContent || undefined,
              draftContent: srcDetail.draftContent || undefined,
              searchContent: srcDetail.searchContent || undefined,
              // <---
              createdAt: toEntityDate(srcDetail.createdAt),
              updatedAt: toEntityDate(srcDetail.updatedAt),
            }
          }
          return result
        }, {} as ArticleSrcByLang)
      }
    }

    return entity as ToEntity<DOC>
  }

  export function toEntities<DOC extends DeepPartial<DocStorageNode>>(
    dbResponse: ElasticSearchAPIResponse<DOC> | ElasticMSearchAPIResponse<DOC>
  ): ToEntity<DOC>[] {
    return dbResponseToEntities(dbResponse, toEntity)
  }

  export import generateId = CoreStorageSchema.generateId

  export import getNodeLevel = CoreStorageSchema.getNodeLevel

  export import toPathData = CoreStorageSchema.toPathData

  export import EmptyShareDetail = CoreStorageSchema.EmptyShareDetail
}

//========================================================================
//
//  Exports
//
//========================================================================

export { UserSchema, CoreStorageSchema, StorageSchema, dbResponseToEntities }
