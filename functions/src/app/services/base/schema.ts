import { BaseIndexDefinitions, ElasticTimestamp, ElasticTimestampEntity } from '../../base/elastic'
import { CoreStorageNode, StorageArticleDirSettings, StorageArticleFileSettings, StorageNode, User } from './types'
import { Entities } from 'web-base-lib'
import { config } from '../../../config'
import { merge } from 'lodash'
const { kuromoji_analyzer, kuromoji_html_analyzer, TimestampEntityProps } = BaseIndexDefinitions

//========================================================================
//
//  Interfaces
//
//========================================================================

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
        email: {
          type: 'keyword',
        },
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
}

namespace CoreStorageSchema {
  export const IndexAliases = {
    prod: `${Entities.StorageNodes.Name}`,
    dev: `${Entities.StorageNodes.Name}`,
    test: `${Entities.StorageNodes.Name}-test`,
  }

  export const IndexAlias = IndexAliases[config.env.mode]

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
}

namespace StorageSchema {
  export const IndexAliases = CoreStorageSchema.IndexAliases

  export const IndexAlias = IndexAliases[config.env.mode]

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
}

//========================================================================
//
//  Exports
//
//========================================================================

export { UserSchema, CoreStorageSchema, StorageSchema }
