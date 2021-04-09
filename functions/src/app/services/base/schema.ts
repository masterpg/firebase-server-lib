import * as _path from 'path'
import { BaseIndexDefinitions, ElasticMSearchAPIResponse, ElasticSearchAPIResponse } from '../../base/elastic'
import {
  CoreStorageNode,
  StorageArticleDirDetail,
  StorageArticleFileDetail,
  StorageArticleSrcByLang,
  StorageArticleSrcDetail,
  StorageNode,
  StorageNodeShareDetail,
  User,
} from './index'
import {
  Entities,
  LangCodes,
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
            dir: {
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
              },
            },
            file: {
              properties: {
                type: {
                  type: 'keyword',
                },
              },
            },
            src: {
              properties: {
                ja: {
                  properties: {
                    masterId: {
                      type: 'keyword',
                    },
                    draftId: {
                      type: 'keyword',
                    },
                    createdAt: {
                      type: 'date',
                    },
                    updatedAt: {
                      type: 'date',
                    },
                    textContent: {
                      type: 'text',
                      analyzer: 'kuromoji_analyzer',
                    },
                  },
                },
                en: {
                  properties: {
                    masterId: {
                      type: 'keyword',
                    },
                    draftId: {
                      type: 'keyword',
                    },
                    createdAt: {
                      type: 'date',
                    },
                    updatedAt: {
                      type: 'date',
                    },
                    textContent: {
                      type: 'text',
                      analyzer: 'standard',
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

  export interface DBStorageNode extends ToRawTimestamp<Omit<StorageNode, 'article'>> {
    article?: {
      dir?: StorageArticleDirDetail
      file?: StorageArticleFileDetail
      src?: DBStorageArticleSrcByLang
    }
  }

  export interface DBStorageArticleSrcByLang {
    ja?: DBStorageArticleSrcDetail
    en?: DBStorageArticleSrcDetail
  }

  export interface DBStorageArticleSrcDetail extends ToRawTimestamp<StorageArticleSrcDetail> {
    textContent: string
  }

  export interface StorageNodeInput extends Omit<StorageNode, 'article'> {
    article?: {
      dir?: StorageArticleDirDetail
      file?: StorageArticleFileDetail
      src?: StorageArticleSrcByLangInput
    }
  }

  export interface StorageArticleSrcByLangInput {
    ja?: StorageArticleSrcDetailInput
    en?: StorageArticleSrcDetailInput
  }

  export interface StorageArticleSrcDetailInput extends StorageArticleSrcDetail {
    textContent?: string
  }

  export function toEntity(dbEntity: DBStorageNode): StorageNode {
    const result: StorageNode = { ...CoreStorageSchema.toEntity(dbEntity) }
    if (dbEntity.article) {
      result.article = {}
      if (dbEntity.article.dir) {
        const dir: StorageArticleDirDetail = {
          label: dbEntity.article.dir.label,
          type: dbEntity.article.dir.type,
          sortOrder: dbEntity.article.dir.sortOrder ?? null,
        }
        merge(result.article, { dir })
      }
      if (dbEntity.article.file) {
        const file: StorageArticleFileDetail = {
          type: dbEntity.article.file.type,
        }
        merge(result.article, { file })
      }
      if (dbEntity.article.src) {
        const src = LangCodes.reduce((result, langCode) => {
          const srcDetail = dbEntity.article?.src?.[langCode]
          if (srcDetail) {
            result[langCode] = {
              masterId: srcDetail.masterId,
              draftId: srcDetail.draftId,
              createdAt: toEntityDate(srcDetail.createdAt),
              updatedAt: toEntityDate(srcDetail.updatedAt),
            }
          }
          return result
        }, {} as StorageArticleSrcByLang)
        merge(result.article, { src })
      }
    }
    return result
  }

  export function toDBEntity(appEntity: StorageNodeInput): DBStorageNode {
    const result: DBStorageNode = { ...CoreStorageSchema.toDBEntity(appEntity) }
    if (appEntity.article) {
      result.article = {}
      if (appEntity.article.dir) {
        const dir: StorageArticleDirDetail = pickProps(appEntity.article.dir, ['label', 'type', 'sortOrder'])
        merge(result.article, { dir })
      }
      if (appEntity.article.file) {
        const file: StorageArticleFileDetail = pickProps(appEntity.article.file, ['type'])
        merge(result.article, { file })
      }
      if (appEntity.article.src) {
        const src = LangCodes.reduce((result, langCode) => {
          const srcDetail = appEntity.article?.src?.[langCode]
          if (srcDetail) {
            result[langCode] = {
              ...pickProps(srcDetail, ['masterId', 'draftId']),
              textContent: srcDetail.textContent ?? '',
              createdAt: toRawDate(srcDetail.createdAt),
              updatedAt: toRawDate(srcDetail.updatedAt),
            }
          }
          return result
        }, {} as DBStorageArticleSrcByLang)
        merge(result.article, { src })
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
