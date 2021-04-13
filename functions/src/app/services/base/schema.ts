import * as _path from 'path'
import { ArticleSrcByLang, CoreStorageNode, StorageNode, StorageNodeShareDetail, User } from './index'
import { BaseIndexDefinitions, ElasticMSearchAPIResponse, ElasticSearchAPIResponse } from '../../base/elastic'
import {
  Entities,
  LangCodes,
  ToDeepRawDate,
  ToRawTimestamp,
  pickProps,
  removeBothEndsSlash,
  removeStartDirChars,
  toEntityDate,
  toEntityTimestamp,
  toRawDate,
  toRawTimestamp,
} from 'web-base-lib'
import { config } from '../../../config'
import { generateEntityId } from '../../base'
import { merge } from 'lodash'
const { kuromoji_analyzer, kuromoji_html_analyzer, TimestampEntityProps } = BaseIndexDefinitions

//========================================================================
//
//  Implementation
//
//========================================================================

/**
 * データベースレスポンスから取得したエンティティデータを取り出し、アプリケーションで扱われる形式へ変換します。
 * @param apiResponse
 * @param convertor
 */
function _dbResponseToEntities<APP_ENTITY, DB_ENTITY>(
  apiResponse: ElasticSearchAPIResponse<DB_ENTITY> | ElasticMSearchAPIResponse<DB_ENTITY>,
  convertor: (dbEntity: DB_ENTITY) => APP_ENTITY
): APP_ENTITY[] {
  // Multi search APIのレスポンスの場合
  if ((apiResponse as ElasticMSearchAPIResponse<DB_ENTITY>).body.responses) {
    const multiAPIResponse = apiResponse as ElasticMSearchAPIResponse<DB_ENTITY>
    const nodes: APP_ENTITY[] = []
    for (const response of multiAPIResponse.body.responses) {
      if (!response.hits.hits.length) continue
      nodes.push(...response.hits.hits.map(hit => convertor(hit._source)))
    }
    return nodes
  }
  // Single search APIのレスポンスの場合
  else {
    const singleAPIResponse = apiResponse as ElasticSearchAPIResponse<DB_ENTITY>
    if (!singleAPIResponse.body.hits.hits.length) return []
    return singleAPIResponse.body.hits.hits.map(hit => convertor(hit._source))
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
      },
    },
    mappings: {
      properties: {
        ...TimestampEntityProps,
        userName: {
          type: 'keyword',
        },
        userNameLower: {
          type: 'keyword',
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

  export interface DBUser extends ToRawTimestamp<User> {}

  export function toEntity(dbEntity: DBUser): Omit<User, 'email' | 'emailVerified'> {
    return {
      ...toEntityTimestamp({
        ...pickProps(dbEntity, ['id', 'userName', 'userName', 'fullName', 'isAppAdmin', 'photoURL', 'version', 'createdAt', 'updatedAt']),
      }),
    }
  }

  export function toDBEntity(appEntity: Omit<User, 'email' | 'emailVerified'>): ToRawTimestamp<Omit<User, 'email' | 'emailVerified'>> {
    return {
      ...toRawTimestamp({
        ...pickProps(appEntity, ['id', 'userName', 'fullName', 'isAppAdmin', 'photoURL', 'version', 'createdAt', 'updatedAt']),
        userNameLower: appEntity.userName.toLowerCase(),
      }),
    }
  }

  export function dbResponseToEntities(dbResponse: ElasticSearchAPIResponse<DBUser>): Omit<User, 'email' | 'emailVerified'>[] {
    return _dbResponseToEntities(dbResponse, toEntity)
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

  export interface DBStorageNode extends ToRawTimestamp<CoreStorageNode> {}

  export function toEntity(dbEntity: DBStorageNode): CoreStorageNode {
    return toEntityTimestamp({
      ...pickProps(dbEntity, ['id', 'nodeType', 'contentType', 'size', 'version', 'createdAt', 'updatedAt']),
      ...toPathData(dbEntity.path),
      share: dbEntity.share || EmptyShareDetail(),
    })
  }

  export function toDBEntity(appEntity: CoreStorageNode): DBStorageNode {
    return toRawTimestamp(
      pickProps(appEntity, ['id', 'nodeType', 'name', 'dir', 'path', 'contentType', 'size', 'share', 'version', 'createdAt', 'updatedAt'])
    )
  }

  export function dbResponseToEntities(
    dbResponse: ElasticSearchAPIResponse<DBStorageNode> | ElasticMSearchAPIResponse<DBStorageNode>
  ): CoreStorageNode[] {
    return _dbResponseToEntities(dbResponse, toEntity)
  }

  /**
   * ノードIDを生成します。
   */
  export function generateId(): string {
    return generateEntityId(CoreStorageSchema.IndexAlias)
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

  export type DBStorageNode = ToDeepRawDate<StorageNode>

  export function toEntity(dbEntity: DBStorageNode): StorageNode {
    const result: StorageNode = { ...CoreStorageSchema.toEntity(dbEntity) }
    if (dbEntity.article) {
      result.article = {
        ...pickProps(dbEntity.article, ['type', 'label', 'sortOrder']),
      }
      if (dbEntity.article.src) {
        result.article.src = LangCodes.reduce((result, langCode) => {
          const srcDetail = dbEntity.article?.src?.[langCode]
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
    return result
  }

  export function toDBEntity(entity: StorageNode): DBStorageNode {
    const result: DBStorageNode = { ...CoreStorageSchema.toDBEntity(entity) }
    if (entity.article) {
      result.article = {
        ...pickProps(entity.article, ['type', 'label', 'sortOrder']),
      }
      if (entity.article.src) {
        result.article.src = LangCodes.reduce((result, langCode) => {
          const srcDetail = entity.article?.src?.[langCode]
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
    return result
  }

  export function dbResponseToEntities(
    dbResponse: ElasticSearchAPIResponse<DBStorageNode> | ElasticMSearchAPIResponse<DBStorageNode>
  ): StorageNode[] {
    return _dbResponseToEntities(dbResponse, toEntity)
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

export { UserSchema, CoreStorageSchema, StorageSchema, _dbResponseToEntities as dbResponseToEntities }
