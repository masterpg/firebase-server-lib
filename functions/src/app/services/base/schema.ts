import * as _path from 'path'
import {
  BaseIndexDefinitions,
  ElasticMSearchAPIResponse,
  ElasticSearchAPIResponse,
  ElasticTimestamp,
  ElasticTimestampEntity,
  toElasticTimestamp,
  toEntityTimestamp,
} from '../../base/elastic'
import { CoreStorageNode, StorageArticleDirSettings, StorageArticleFileSettings, StorageNode, StorageNodeShareSettings, User } from './index'
import { Entities, pickProps, removeBothEndsSlash, removeStartDirChars } from 'web-base-lib'
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
function _dbResponseToAppEntities<APP_ENTITY, DB_ENTITY>(
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

  export interface DBUser extends ElasticTimestampEntity<User> {}

  export function toAppEntity(dbEntity: DBUser): Omit<User, 'email' | 'emailVerified'> {
    return {
      ...toEntityTimestamp({
        ...pickProps(dbEntity, ['id', 'userName', 'userName', 'fullName', 'isAppAdmin', 'photoURL', 'version', 'createdAt', 'updatedAt']),
      }),
    }
  }

  export function toDBEntity(appEntity: Omit<User, 'email' | 'emailVerified'>): ElasticTimestampEntity<Omit<User, 'email' | 'emailVerified'>> {
    return {
      ...toElasticTimestamp({
        ...pickProps(appEntity, ['id', 'userName', 'fullName', 'isAppAdmin', 'photoURL', 'version', 'createdAt', 'updatedAt']),
        userNameLower: appEntity.userName.toLowerCase(),
      }),
    }
  }

  export function dbResponseToAppEntities(dbResponse: ElasticSearchAPIResponse<DBUser>): Omit<User, 'email' | 'emailVerified'>[] {
    return _dbResponseToAppEntities(dbResponse, toAppEntity)
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
          type: 'float',
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

  export interface DBStorageNode extends ElasticTimestampEntity<CoreStorageNode> {}

  export function toAppEntity(dbEntity: DBStorageNode): CoreStorageNode {
    return toEntityTimestamp({
      ...pickProps(dbEntity, ['id', 'nodeType', 'contentType', 'size', 'version', 'createdAt', 'updatedAt']),
      ...toPathData(dbEntity.path),
      share: dbEntity.share || EmptyShareSettings(),
    })
  }

  export function toDBEntity(appEntity: CoreStorageNode): DBStorageNode {
    return toElasticTimestamp(
      pickProps(appEntity, ['id', 'nodeType', 'name', 'dir', 'path', 'level', 'contentType', 'size', 'share', 'version', 'createdAt', 'updatedAt'])
    )
  }

  export function dbResponseToAppEntities(
    dbResponse: ElasticSearchAPIResponse<DBStorageNode> | ElasticMSearchAPIResponse<DBStorageNode>
  ): CoreStorageNode[] {
    return _dbResponseToAppEntities(dbResponse, toAppEntity)
  }

  /**
   * ノードIDを生成します。
   */
  export function generateNodeId(): string {
    return generateEntityId(CoreStorageSchema.IndexAlias)
  }

  /**
   * ストアノードレベルを取得します。
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
  export function toPathData(nodePath: string): { name: string; dir: string; path: string; level: number } {
    nodePath = removeBothEndsSlash(nodePath)
    return {
      name: _path.basename(nodePath),
      dir: removeStartDirChars(_path.dirname(nodePath)),
      path: nodePath,
      level: getNodeLevel(nodePath),
    }
  }

  /**
   * 空の共有設定を生成します。
   */
  export function EmptyShareSettings(): StorageNodeShareSettings {
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
                name: {
                  type: 'keyword',
                  fields: {
                    text: {
                      type: 'text',
                      analyzer: 'kuromoji_analyzer',
                    },
                  },
                },
                type: {
                  type: 'keyword',
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
            textContent: {
              type: 'text',
              analyzer: 'kuromoji_analyzer',
            },
          },
        },
      },
    },
  })

  export interface DBStorageNode extends Omit<StorageNode, 'article' | 'createdAt' | 'updatedAt'>, ElasticTimestamp {
    article?: {
      dir?: StorageArticleDirSettings
      file?: StorageArticleFileSettings
    }
  }

  export function toAppEntity(dbEntity: DBStorageNode): StorageNode {
    const result: StorageNode = { ...CoreStorageSchema.toAppEntity(dbEntity) }
    if (dbEntity.article?.dir) {
      result.article = {
        dir: {
          name: dbEntity.article.dir.name,
          type: dbEntity.article.dir.type,
          sortOrder: dbEntity.article.dir.sortOrder ?? null,
        },
      }
    } else if (dbEntity.article?.file) {
      result.article = {
        file: {
          type: dbEntity.article.file.type,
        },
      }
    }
    return result
  }

  export function toDBEntity(appEntity: StorageNode): DBStorageNode {
    const result: DBStorageNode = { ...CoreStorageSchema.toDBEntity(appEntity) }
    if (appEntity.article?.dir) {
      result.article = { dir: pickProps(appEntity.article.dir, ['name', 'type', 'sortOrder']) }
    } else if (appEntity.article?.file) {
      result.article = { file: pickProps(appEntity.article.file, ['type']) }
    }
    return result
  }

  export function dbResponseToAppEntities(
    dbResponse: ElasticSearchAPIResponse<DBStorageNode> | ElasticMSearchAPIResponse<DBStorageNode>
  ): StorageNode[] {
    return _dbResponseToAppEntities(dbResponse, toAppEntity)
  }

  export import generateNodeId = CoreStorageSchema.generateNodeId

  export import getNodeLevel = CoreStorageSchema.getNodeLevel

  export import toPathData = CoreStorageSchema.toPathData

  export import EmptyShareSettings = CoreStorageSchema.EmptyShareSettings
}

//========================================================================
//
//  Exports
//
//========================================================================

export { UserSchema, CoreStorageSchema, StorageSchema, _dbResponseToAppEntities as dbResponseToAppEntities }
