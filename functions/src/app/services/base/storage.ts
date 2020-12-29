import * as _path from 'path'
import * as admin from 'firebase-admin'
import { AuthServiceDI, AuthServiceModule } from './auth'
import {
  CreateStorageNodeInput,
  SignedUploadUrlInput,
  StorageNode,
  StorageNodeGetKeyInput,
  StorageNodeGetKeysInput,
  StorageNodeKeyInput,
  StorageNodeShareSettings,
  StorageNodeShareSettingsInput,
  StorageNodeType,
  StoragePaginationInput,
  StoragePaginationResult,
} from '../types'
import {
  ElasticPageToken,
  ElasticResponse,
  ElasticTimestamp,
  SearchResponse,
  closePointInTime,
  decodePageToken,
  encodePageToken,
  extractSearchAfter,
  isPaginationTimeout,
  newElasticClient,
  openPointInTime,
  validateBulkResponse,
} from '../../base/elastic'
import { Entities, RequiredAre, arrayToDict, removeBothEndsSlash, removeStartDirChars, splitArrayChunk, splitHierarchicalPaths } from 'web-base-lib'
import { File, SaveOptions } from '@google-cloud/storage'
import { Inject, Module } from '@nestjs/common'
import { InputValidationError, generateEntityId, validateUID } from '../../base'
import { Request, Response } from 'express'
import dayjs = require('dayjs')
import { config } from '../../../config'

//========================================================================
//
//  Interfaces
//
//========================================================================

interface StorageFileNode extends StorageNode {
  file: File
}

interface StorageFileDetail {
  file: File
  version: number
  exists: boolean
}

interface StorageFileMetadata {
  version: number
}

interface StorageFileMetadataInput {
  version?: number
}

interface StorageFileRawMetadata {
  version: string
}

interface StorageUploadDataItem {
  data: string | Buffer
  path: string
  contentType: string
  share?: StorageNodeShareSettingsInput
}

interface WriteBaseStorageNode {
  id: string
  name: string
  dir: string
  path: string
  level: number
  share?: StorageNodeShareSettings
}

interface RawStorageNode extends Omit<StorageNode, 'createdAt' | 'updatedAt'>, ElasticTimestamp {}

const IndexDefinition = {
  settings: {
    analysis: {
      analyzer: {
        kuromoji_analyzer: {
          type: 'custom',
          char_filter: ['kuromoji_iteration_mark'],
          tokenizer: 'kuromoji_tokenizer',
          filter: ['kuromoji_baseform', 'kuromoji_part_of_speech', 'kuromoji_stemmer', 'kuromoji_number'],
        },
        kuromoji_html_analyzer: {
          type: 'custom',
          char_filter: ['html_strip', 'kuromoji_iteration_mark'],
          tokenizer: 'kuromoji_tokenizer',
          filter: ['kuromoji_baseform', 'kuromoji_part_of_speech', 'kuromoji_stemmer', 'kuromoji_number'],
        },
      },
    },
  },
  mappings: {
    properties: {
      id: {
        type: 'keyword',
      },
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
      articleNodeName: {
        type: 'keyword',
        fields: {
          text: {
            type: 'text',
            analyzer: 'kuromoji_analyzer',
          },
        },
      },
      articleNodeType: {
        type: 'keyword',
      },
      articleSortOrder: {
        type: 'long',
      },
      articleText: {
        type: 'text',
        analyzer: 'kuromoji_analyzer',
      },
      isArticleFile: {
        type: 'boolean',
      },
      version: {
        type: 'long',
      },
      createdAt: {
        type: 'date',
      },
      updatedAt: {
        type: 'date',
      },
    },
  },
}

//========================================================================
//
//  Implementation
//
//========================================================================

class StorageService<NODE extends StorageNode = StorageNode, FILE_NODE extends NODE & StorageFileNode = NODE & StorageFileNode> {
  constructor(@Inject(AuthServiceDI.symbol) protected readonly authService: AuthServiceDI.type) {}

  readonly client = newElasticClient()

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  /**
   * 指定されたノードを取得します。
   * @param input
   */
  async getNode(input: StorageNodeGetKeyInput): Promise<NODE | undefined> {
    if (!input.id && !input.path) {
      return undefined
    }

    const id = input.id ?? ''
    const path = removeBothEndsSlash(input.path)

    const response = await this.client.search<SearchResponse<RawStorageNode>>({
      index: StorageService.IndexAlias,
      body: {
        query: {
          bool: {
            should: [{ term: { id } }, { term: { path } }],
          },
        },
      },
    })

    const nodes = this.responseToNodes(response)
    return nodes.length ? nodes[0] : undefined
  }

  /**
   * 指定されたノードを取得します。
   * 指定されたノードが見つからなかった場合、例外がスローされます。
   * @param input
   */
  async sgetNode(input: StorageNodeGetKeyInput): Promise<NODE> {
    const node = await this.getNode(input)
    if (!node) {
      throw new Error(`There is no node in the specified key: ${JSON.stringify(input)}`)
    }
    return node
  }

  /**
   * 指定されたノードリストを取得します。
   * @param input
   */
  async getNodes(input: StorageNodeGetKeysInput): Promise<NODE[]> {
    const ids = input.ids || []
    const paths = input.paths || []
    const size = 1000

    const nodes: NODE[] = []
    for (const chunk of splitArrayChunk(ids, size)) {
      const response = await this.client.search<SearchResponse<RawStorageNode>>({
        index: StorageService.IndexAlias,
        size,
        body: {
          query: { terms: { id: chunk } },
        },
      })
      nodes.push(...this.responseToNodes(response))
    }
    for (const chunk of splitArrayChunk(paths, size)) {
      const response = await this.client.search<SearchResponse<RawStorageNode>>({
        index: StorageService.IndexAlias,
        size,
        body: {
          query: { terms: { path: chunk } },
        },
      })
      nodes.push(...this.responseToNodes(response))
    }

    const nodeIdDict: { [id: string]: StorageNode } = {}
    const nodePathDict: { [id: string]: StorageNode } = {}
    for (const node of nodes) {
      nodeIdDict[node.id] = node
      nodePathDict[node.path] = node
    }

    const result: StorageNode[] = []
    for (const id of ids) {
      const node = nodeIdDict[id]
      node && result.push(node)
    }
    for (const path of paths) {
      const node = nodePathDict[path]
      node && result.push(node)
    }

    return result as NODE[]
  }

  /**
   * 指定されたファイルノードを取得します。
   * @param key
   */
  async getFileNode(key: StorageNodeGetKeyInput): Promise<FILE_NODE | undefined> {
    const fileNode = await this.getNode(key)
    if (!fileNode) return undefined

    const { file, exists } = await this.getStorageFile(fileNode.id)
    if (!exists) return undefined

    return { ...fileNode, file } as FILE_NODE
  }

  /**
   * 指定されたファイルノードを取得します。
   * 指定されたファイルノードが見つからなかった場合、例外がスローされます。
   * @param key
   */
  async sgetFileNode(key: StorageNodeGetKeyInput): Promise<FILE_NODE> {
    const node = await this.getFileNode(key)
    if (!node) {
      throw new Error(`There is no node in the specified key: ${JSON.stringify(key)}`)
    }
    return node
  }

  /**
   * ストレージのファイルを取得します。
   * @param nodeId
   */
  async getStorageFile(nodeId: string): Promise<StorageFileDetail> {
    const bucket = admin.storage().bucket()
    const file = bucket.file(nodeId)
    const [exists] = await file.exists()
    const metadata = StorageService.extractMetaData(file)

    return { file, ...metadata, exists }
  }

  /**
   * 指定されたディレクトリ＋配下のノードを取得します。
   *
   * 引数が次のように指定された場合、
   *   + dirPath: 'archives/photos'
   *
   * 次のようなノードが取得されます。
   *   + 'archives/photos'
   *   + 'archives/photos/travel'
   *   + 'archives/photos/travel/tokyo.png'
   *   + 'archives/photos/children.png'
   *   + 'archives/photos/family.png'
   *
   * @param dirPath
   * @param input
   */
  async getDirDescendants(dirPath?: string, input?: StoragePaginationInput): Promise<StoragePaginationResult<NODE>> {
    return this.m_getDescendants(dirPath, { ...input, includeSpecifiedDir: true })
  }

  /**
   * 指定されたディレクトリ配下のノードを取得します。
   *
   * 引数が次のように指定された場合、
   *   + dirPath: 'archives/photos'
   *
   * 次のようなノードが取得されます。
   *   + 'archives/photos/travel'
   *   + 'archives/photos/travel/tokyo.png'
   *   + 'archives/photos/children.png'
   *   + 'archives/photos/family.png'
   *
   * @param dirPath
   * @param input
   */
  async getDescendants(dirPath?: string, input?: StoragePaginationInput): Promise<StoragePaginationResult<NODE>> {
    return this.m_getDescendants(dirPath, { ...input, includeSpecifiedDir: false })
  }

  private async m_getDescendants(
    dirPath?: string,
    input?: StoragePaginationInput & { includeSpecifiedDir: boolean }
  ): Promise<StoragePaginationResult<NODE>> {
    dirPath = removeBothEndsSlash(dirPath)
    const maxChunk = input?.maxChunk || StorageService.MaxChunk
    const includeSpecifiedDir = Boolean(input?.includeSpecifiedDir)

    const pageToken = decodePageToken(input?.pageToken)
    if (!pageToken.pit) {
      pageToken.pit = await openPointInTime(this.client, StorageService.IndexAlias)
    }

    let query: any
    // 引数ディレクトリが指定された場合
    if (dirPath) {
      if (includeSpecifiedDir) {
        query = {
          bool: {
            should: [
              {
                bool: {
                  must: [{ term: { path: dirPath } }, { term: { nodeType: StorageNodeType.Dir } }],
                },
              },
              { wildcard: { path: `${dirPath}/*` } },
            ],
          },
        }
      } else {
        query = { wildcard: { path: `${dirPath}/*` } }
      }
    }
    // 引数ディレクトリが指定されなかった場合
    else {
      // バケット配下を検索 (全ノード検索)
      query = { match_all: {} }
    }

    // データベースからノードを取得
    let response!: ElasticResponse<RawStorageNode>
    try {
      response = await this.client.search<SearchResponse<RawStorageNode>>({
        size: maxChunk,
        body: {
          query,
          sort: [{ path: 'asc' }],
          ...pageToken,
        },
      })
    } catch (err) {
      if (isPaginationTimeout(err)) {
        return { list: [], isPaginationTimeout: true }
      } else {
        throw err
      }
    }
    const nodes = this.responseToNodes(response) as NODE[]

    // 引数ディレクトリを含む検索の初回検索だった場合
    if (includeSpecifiedDir && dirPath && !input?.pageToken) {
      // 引数で指定されたパスのノードが存在しない場合
      if (!nodes.some(node => node.path === dirPath)) {
        // 検索結果なしで終了
        return { list: [] }
      }
    }

    // 次ページのページトークンを取得
    let nextPageToken: string | undefined
    const searchAfter = extractSearchAfter(response)
    if (nodes.length === 0 || nodes.length < maxChunk) {
      nextPageToken = undefined
      searchAfter?.pitId && (await closePointInTime(this.client, searchAfter.pitId))
    } else {
      if (searchAfter?.pitId && searchAfter?.sort) {
        nextPageToken = encodePageToken(searchAfter.pitId, searchAfter.sort)
      } else {
        nextPageToken = undefined
      }
    }

    return { nextPageToken, list: nodes }
  }

  /**
   * 指定されたディレクトリ＋配下のノードの数を取得します。
   *
   * @param dirPath
   */
  async getDirDescendantCount(dirPath?: string): Promise<number> {
    return this.m_getDescendantCount(dirPath, { includeSpecifiedDir: true })
  }

  /**
   * 指定されたディレクトリ配下のノードの数を取得します。
   *
   * @param dirPath
   * @param input
   */
  async getDescendantCount(dirPath?: string, input?: StoragePaginationInput): Promise<number> {
    return this.m_getDescendantCount(dirPath, { includeSpecifiedDir: false })
  }

  private async m_getDescendantCount(dirPath?: string, input?: { includeSpecifiedDir: boolean }): Promise<number> {
    const includeSpecifiedDir = Boolean(input?.includeSpecifiedDir)

    let query: any
    // 引数ディレクトリが指定された場合
    if (dirPath) {
      if (includeSpecifiedDir) {
        query = {
          bool: {
            should: [
              {
                bool: {
                  must: [{ term: { path: dirPath } }, { term: { nodeType: StorageNodeType.Dir } }],
                },
              },
              { wildcard: { path: `${dirPath}/*` } },
            ],
          },
        }
      } else {
        query = { wildcard: { path: `${dirPath}/*` } }
      }
    }
    // 引数ディレクトリが指定されなかった場合
    else {
      // バケット配下を検索 (全ノード検索)
      query = { match_all: {} }
    }

    // データベースからカウントを取得
    const response = await this.client.count({
      index: StorageService.IndexAlias,
      body: { query },
    })

    return response.body.count
  }

  /**
   * 指定されたディレクトリ＋直下のノードを取得します。
   *
   * 引数が次のように指定された場合、
   *   + dirPath: 'archives/photos'
   *
   * 次のようなノードが取得されます。
   *   + 'archives/photos'
   *   + 'archives/photos/family.png'
   *   + 'archives/photos/children.png'
   *
   * @param dirPath
   * @param input
   */
  async getDirChildren(dirPath?: string, input?: StoragePaginationInput): Promise<StoragePaginationResult<NODE>> {
    return this.m_getChildren(dirPath, { ...input, includeSpecifiedDir: true })
  }

  /**
   * 指定されたディレクトリ直下のノードを取得します。
   *
   * 引数が次のように指定された場合、
   *   + dirPath: 'archives/photos'
   *
   * 次のようなノードが取得されます。
   *   + 'archives/photos/family.png'
   *   + 'archives/photos/children.png'
   *
   * @param dirPath
   * @param input
   */
  async getChildren(dirPath?: string, input?: StoragePaginationInput): Promise<StoragePaginationResult<NODE>> {
    return this.m_getChildren(dirPath, { ...input, includeSpecifiedDir: false })
  }

  private async m_getChildren(
    dirPath?: string,
    input?: StoragePaginationInput & { includeSpecifiedDir: boolean }
  ): Promise<StoragePaginationResult<NODE>> {
    const maxChunk = input?.maxChunk || StorageService.MaxChunk
    const includeSpecifiedDir = Boolean(input?.includeSpecifiedDir)

    const pageToken = decodePageToken(input?.pageToken)
    if (!pageToken.pit) {
      pageToken.pit = await openPointInTime(this.client, StorageService.IndexAlias)
    }

    let query: any
    // 引数ディレクトリが指定された場合
    if (dirPath) {
      if (includeSpecifiedDir) {
        query = {
          bool: {
            should: [
              {
                bool: {
                  must: [{ term: { path: dirPath } }, { term: { nodeType: StorageNodeType.Dir } }],
                },
              },
              { term: { dir: dirPath } },
            ],
          },
        }
      } else {
        query = {
          term: { dir: dirPath },
        }
      }
    }
    // 引数ディレクトリが指定されなかった場合
    else {
      // バケット直下を検索
      query = {
        term: { dir: '' },
      }
    }

    // データベースからノードを取得
    let response!: ElasticResponse<RawStorageNode>
    try {
      response = await this.client.search<SearchResponse<RawStorageNode>>({
        size: maxChunk,
        body: {
          query,
          sort: [{ path: 'asc' }],
          ...pageToken,
        },
      })
    } catch (err) {
      if (isPaginationTimeout(err)) {
        return { list: [], isPaginationTimeout: true }
      } else {
        throw err
      }
    }
    const nodes = this.responseToNodes(response) as NODE[]

    // 引数ディレクトリを含む検索の初回検索だった場合
    if (includeSpecifiedDir && dirPath && !input?.pageToken) {
      // 引数で指定されたパスのノードが存在しない場合
      if (!nodes.some(node => node.path === dirPath)) {
        // 検索結果なしで終了
        return { list: [] }
      }
    }

    // 次ページのページトークンを取得
    let nextPageToken: string | undefined
    const searchAfter = extractSearchAfter(response)
    if (nodes.length === 0 || nodes.length < maxChunk) {
      nextPageToken = undefined
      searchAfter?.pitId && (await closePointInTime(this.client, searchAfter.pitId))
    } else {
      if (searchAfter?.pitId && searchAfter?.sort) {
        nextPageToken = encodePageToken(searchAfter.pitId, searchAfter.sort)
      } else {
        nextPageToken = undefined
      }
    }

    return { nextPageToken, list: nodes }
  }

  /**
   * 指定されたディレクトリ＋直下のノードの数を取得します。
   *
   * @param dirPath
   */
  async getDirChildCount(dirPath?: string): Promise<number> {
    return this.m_getChildCount(dirPath, { includeSpecifiedDir: true })
  }

  /**
   * 指定されたディレクトリ直下のノードの数を取得します。
   *
   * @param dirPath
   * @param input
   */
  async getChildCount(dirPath?: string, input?: StoragePaginationInput): Promise<number> {
    return this.m_getChildCount(dirPath, { includeSpecifiedDir: false })
  }

  private async m_getChildCount(dirPath?: string, input?: { includeSpecifiedDir: boolean }): Promise<number> {
    const includeSpecifiedDir = Boolean(input?.includeSpecifiedDir)

    let query: any
    // 引数ディレクトリが指定された場合
    if (dirPath) {
      if (includeSpecifiedDir) {
        query = {
          bool: {
            should: [
              {
                bool: {
                  must: [{ term: { path: dirPath } }, { term: { nodeType: StorageNodeType.Dir } }],
                },
              },
              { term: { dir: dirPath } },
            ],
          },
        }
      } else {
        query = {
          term: { dir: dirPath },
        }
      }
    }
    // 引数ディレクトリが指定されなかった場合
    else {
      // バケット直下を検索
      query = {
        term: { dir: '' },
      }
    }

    // データベースからカウントを取得
    const response = await this.client.count({
      index: StorageService.IndexAlias,
      body: { query },
    })

    return response.body.count
  }

  /**
   * 指定されたノードとノードの階層構造を形成するディレクトリを取得します。
   * @param nodePath
   */
  async getHierarchicalNodes(nodePath: string): Promise<NODE[]> {
    if (!nodePath) return []

    // 引数ノードの祖先ディレクトリを取得
    const ancestorDirPaths = splitHierarchicalPaths(nodePath)
    // 最後尾のノード(引数ノード)のパスを削除
    // ※引数ノードは以下で別に取得するため
    ancestorDirPaths.pop()

    // 引数ノードを取得
    const node = await this.getNode({ path: nodePath })

    let nodes: NODE[]

    // 引数ノードが存在する場合
    // ※引数ノードが存在するので、祖先ディレクトリも存在しなくてはならない
    if (node) {
      const ancestorDirNodes = await this.getNodes({ paths: ancestorDirPaths })
      // 欠けているディレクトリがあった場合は穴埋めする
      if (ancestorDirNodes.length !== ancestorDirPaths.length) {
        const addedNodes = await this.createHierarchicalDirs(ancestorDirPaths)
        ancestorDirNodes.push(...addedNodes)
      }
      nodes = [...ancestorDirNodes, node]
    }
    // 引数ノードが存在しない場合
    // ※引数ノードは存在しないので、実際に存在する祖先ディレクトリのみを取得する
    else {
      nodes = await this.getNodes({ paths: ancestorDirPaths })
    }

    return StorageService.sortNodes(nodes)
  }

  /**
   * 指定されたノードの階層構造を形成する祖先ディレクトリを取得します。
   * @param nodePath
   */
  async getAncestorDirs(nodePath: string): Promise<NODE[]> {
    if (!nodePath) return []

    nodePath = removeBothEndsSlash(nodePath)

    const result = await this.getHierarchicalNodes(nodePath)
    return result.filter(node => node.path !== nodePath)
  }

  /**
   * ディレクトリを作成します。
   * @param dirPath
   * @param input
   */
  async createDir(dirPath: string, input?: CreateStorageNodeInput): Promise<NODE> {
    // 指定されたパスのバリデーションチェック
    StorageService.validateNodePath(dirPath)
    dirPath = removeBothEndsSlash(dirPath)

    // 共有設定の入力値を検証
    StorageService.validateShareSettingInput(input)

    // 引数ディレクトリの階層構造形成に必要なノードを取得
    const hierarchicalDirNodes = await this.getRequiredHierarchicalDirNodes(dirPath)
    const ancestorDirNodes = hierarchicalDirNodes.filter(node => node.path !== dirPath)
    const hierarchicalDirNodeDict = arrayToDict(hierarchicalDirNodes, 'path')

    for (const ancestorDirNode of ancestorDirNodes) {
      // 祖先ディレクトリが存在することをチェック
      if (!ancestorDirNode.exists) {
        throw new InputValidationError(`The ancestor directory of the specified directory does not exist.`, {
          specifiedPath: dirPath,
          ancestorPath: ancestorDirNode.path,
        })
      }
    }

    const dirNode = hierarchicalDirNodeDict[dirPath]
    // 引数ディレクトリがまだ存在しない場合
    if (!dirNode.exists) {
      // ディレクトリを作成し、データベースに追加
      const id = StorageService.generateNodeId()
      const now = dayjs().toISOString()
      await this.client.update({
        index: StorageService.IndexAlias,
        id,
        body: {
          doc: {
            ...StorageService.toDBNode(dirNode),
            id,
            share: this.toStoreShareSettings(input ?? null),
            version: 1,
            createdAt: now,
            updatedAt: now,
          },
          doc_as_upsert: true,
        },
        refresh: true,
      })
      // ストアに追加された最新ディレクトリを取得
      return (await this.getNode({ id }))!
    }
    // 引数ディレクトリが既に存在する場合
    else {
      if (input) {
        return await this.setDirShareSettings(dirPath, input)
      } else {
        return (await this.getNode({ path: dirPath }))!
      }
    }
  }

  /**
   * ディレクトリを作成します。
   *
   * 引数が次のように指定された場合、
   *   + dirPaths[0]: 'home/photos'
   *   + dirPaths[1]: 'home/docs'
   *
   * 次のディレクトリが作成されます。
   *   + 'home'
   *   + 'home/photos'
   *   + 'home/docs'
   *
   * @param dirPaths
   */
  async createHierarchicalDirs(dirPaths: string[]): Promise<NODE[]> {
    // 指定されたパスのバリデーションチェック
    dirPaths.forEach(dirPath => StorageService.validateNodePath(dirPath))
    dirPaths = dirPaths.map(dirPath => removeBothEndsSlash(dirPath))

    // 引数ディレクトリの階層構造形成に必要なノードを取得
    const hierarchicalDirNodes = await this.getRequiredHierarchicalDirNodes(...dirPaths)

    // ディレクトリを作成
    const ids: string[] = []
    const body: any[] = []
    for (const dirNode of hierarchicalDirNodes) {
      // ディレクトリが存在する場合はディレクトリを作成しない
      if (dirNode.exists) continue

      const id = StorageService.generateNodeId()
      const now = dayjs().toISOString()
      body.push({ index: { _index: StorageService.IndexAlias, _id: id } })
      body.push({
        ...StorageService.toDBNode(dirNode),
        id,
        version: 1,
        createdAt: now,
        updatedAt: now,
      })

      ids.push(id)
    }
    if (body.length) {
      const response = await this.client.bulk({ refresh: true, body })
      validateBulkResponse(response)
    }

    const dirNodes = await this.getNodes({ ids })
    return StorageService.sortNodes(dirNodes)
  }

  /**
   * 指定されたディレクトリを含め配下のノードを削除します。
   *
   * 引数が次のように指定された場合、
   *   + dirPath: 'home/photos'
   *
   * 次のようなディレクトリ、ファイルが削除されます。
   *   + 'home/photos'
   *   + 'home/photos/family.png'
   *   + 'home/photos/children.png'
   *
   * @param dirPath
   * @param input
   */
  async removeDir(dirPath: string, input?: { maxChunk?: number }): Promise<void> {
    if (!dirPath) {
      throw new Error(`The argument 'dirPath' is empty.`)
    }

    const bucket = admin.storage().bucket()
    const size = input?.maxChunk ?? 1000
    let nodes: { id: string; path: string }[]
    const pageToken: ElasticPageToken = {
      pit: await openPointInTime(this.client, StorageService.IndexAlias),
    }

    do {
      // データベースから引数ディレクトリ配下のファイルノードを取得
      const response = await this.client.search<SearchResponse<{ id: string; path: string }>>({
        size,
        body: {
          query: {
            bool: {
              must: [
                {
                  bool: {
                    should: [{ term: { path: dirPath } }, { wildcard: { path: `${dirPath}/*` } }],
                  },
                },
                { term: { nodeType: StorageNodeType.File } },
              ],
            },
          },
          sort: [{ path: 'asc' }],
          ...pageToken,
        },
        _source: ['id', 'path'],
      })
      nodes = response.body.hits.hits.map(hit => hit._source)

      // ストレージからファイルを削除
      for (const chunk of splitArrayChunk(nodes, size)) {
        await Promise.all(
          chunk.map(async node => {
            const file = bucket.file(node.id)
            await file.delete({ ignoreNotFound: true })
          })
        )
      }

      // 次のページングトークンを取得
      if (nodes.length) {
        const searchAfter = extractSearchAfter(response)!
        pageToken.pit.id = searchAfter.pitId!
        pageToken.search_after = searchAfter.sort!
      }
    } while (nodes.length)

    // データベースから引数ディレクトリと配下ノードを全て削除
    await this.client.deleteByQuery({
      index: StorageService.IndexAlias,
      body: {
        query: {
          bool: {
            should: [{ term: { path: dirPath } }, { wildcard: { path: `${dirPath}/*` } }],
          },
        },
      },
      refresh: true,
    })
  }

  /**
   * ファイルを削除します。
   * @param filePath
   */
  async removeFile(filePath: string): Promise<FILE_NODE | undefined> {
    if (!filePath) {
      throw new Error(`The argument 'filePath' is empty.`)
    }

    const fileNode = await this.getFileNode({ path: filePath })
    if (!fileNode) return undefined

    // ストレージからファイルを削除
    await fileNode.file.delete()
    // ストアからファイルを削除
    await this.client.delete({
      index: StorageService.IndexAlias,
      id: fileNode.id,
      refresh: true,
    })

    return fileNode
  }

  /**
   * ディレクトリの移動を行います。
   *
   * 引数が次のように指定された場合、
   *   + fromDirPath: 'home/photos'
   *   + toDirPath: 'home/archives/photos'
   *
   * 次のようなディレクトリの移動が行われます。
   *   + 移動元: 'home/photos'
   *   + 移動先: 'home/archives/photos'
   *
   * 戻り値は次のようなノードが返されます。
   *   + 'home/archives/photos'
   *   + 'home/archives/photos/20190101'
   *   + 'home/archives/photos/20190101/family1.png'
   *
   * 移動元ディレクトリまたは移動先ディレクトリがない場合は例外がスローされます。
   *
   * @param fromDirPath
   * @param toDirPath
   * @param input
   */
  async moveDir(fromDirPath: string, toDirPath: string, input?: { maxChunk?: number }): Promise<void> {
    fromDirPath = removeBothEndsSlash(fromDirPath)
    toDirPath = removeBothEndsSlash(toDirPath)
    const maxChunk = input?.maxChunk ?? 1000

    StorageService.validateNodePath(toDirPath)

    // 移動元と移動先が同じでないことを確認
    if (fromDirPath === toDirPath) {
      throw new Error(`The source and destination are the same: '${fromDirPath}' -> '${toDirPath}'`)
    }

    // 移動先ディレクトリが移動元のサブディレクトリでないことを確認
    // from: aaa/bbb → to: aaa/bbb/ccc/bbb [NG]
    //               → to: aaa/zzz/ccc/bbb [OK]
    if (toDirPath.startsWith(_path.join(fromDirPath, '/'))) {
      throw new Error(`The destination directory is its own subdirectory: '${_path.join(fromDirPath)}' -> '${_path.join(toDirPath)}'`)
    }

    // 移動先の所属ディレクトリの存在確認
    // ※バケット直下への移動時はディレクトリの存在確認はしない
    const toParentPath = removeStartDirChars(_path.dirname(toDirPath))
    if (toParentPath) {
      const toParentNode = await this.getNode({ path: toParentPath })
      if (!toParentNode) {
        throw new Error(`The destination directory does not exist: '${toParentPath}'`)
      }
    }

    let pagination: StoragePaginationResult<NODE> = { nextPageToken: undefined, list: [] }
    do {
      pagination = await this.getDirDescendants(fromDirPath, {
        maxChunk,
        pageToken: pagination.nextPageToken,
      })

      // 移動元ノードのパスを移動先のパスへ変換するための正規表現
      const reg = new RegExp(`^${fromDirPath}`)

      // 以降の処理を行いやすくするためにデータ加工
      const { toNodes, toFileNodes } = pagination.list.reduce(
        (result, node) => {
          const toNodePath = node.path.replace(reg, toDirPath)
          const toNode = {
            ...node,
            name: _path.basename(toNodePath),
            dir: _path.dirname(toNodePath),
            path: toNodePath,
            level: StorageService.getNodeLevel(toNodePath),
            version: node.version + 1,
          }
          if (toNode.nodeType === StorageNodeType.File) {
            result.toFileNodes.push(toNode)
          }
          result.toNodes.push(toNode)
          return result
        },
        { toNodes: [], toFileNodes: [] } as { toNodes: StorageNode[]; toFileNodes: StorageNode[] }
      )

      // 移動先に同名のファイルが存在する場合、そのファイルを削除
      // ※ストレージに対する処理
      await Promise.all(
        toFileNodes.map(async toFileNode => {
          const existingToFileNode = await this.getFileNode({ path: toFileNode.path })
          if (existingToFileNode && existingToFileNode.file) {
            await existingToFileNode.file.delete({ ignoreNotFound: true })
          }
        })
      )

      // 移動先に同名のノードが存在する場合、そのノードを削除
      // ※データベースに対する処理
      await this.client.deleteByQuery({
        index: StorageService.IndexAlias,
        body: {
          query: {
            terms: { path: toNodes.map(toNode => toNode.path) },
          },
        },
        refresh: true,
      })

      // 移動元ノードのパスを移動先のパスへ変更
      // ※データベースに対する処理
      await this.client.updateByQuery({
        index: StorageService.IndexAlias,
        body: {
          query: {
            terms: {
              id: toNodes.map(toNode => toNode.id),
            },
          },
          script: {
            lang: 'painless',
            source: `
              ctx._source.name = params[ctx._source.id].name;
              ctx._source.dir = params[ctx._source.id].dir;
              ctx._source.path = params[ctx._source.id].path;
              ctx._source.level = params[ctx._source.id].level;
              ctx._source.version = params[ctx._source.id].version;
            `,
            params: toNodes.reduce((result, toNode) => {
              const { name, dir, path, level, version } = toNode
              result[toNode.id] = { name, dir, path, level, version }
              return result
            }, {} as { [id: string]: { name: string; dir: string; path: string; level: number; version: number } }),
          },
        },
        refresh: true,
      })

      // 移動したファイルのメタデータを更新
      // ※データベースに対する処理
      await Promise.all(
        toFileNodes.map(async toFileNode => {
          const { exists, file } = await this.getStorageFile(toFileNode.id)
          if (exists) {
            await this.saveMetadata(file, { version: toFileNode.version })
          }
        })
      )
    } while (pagination.nextPageToken)
  }

  /**
   * ファイルを指定されたディレクトリへ移動します。
   *
   * 引数が次のように指定された場合、
   *   + fromFilePath: 'home/photos/family.png'
   *   + toFilePath: 'home/archives/family.png'
   *
   * 次のようなファイルの移動が行われます。
   *   + 移動元: 'home/photos/family.png'
   *   + 移動先: 'home/archives/family.png'
   *
   * 移動元ファイルまたは移動先ディレクトリがない場合、移動は行われず、戻り値は何も返しません。
   *
   * @param fromFilePath
   * @param toFilePath
   */
  async moveFile(fromFilePath: string, toFilePath: string): Promise<FILE_NODE> {
    fromFilePath = removeBothEndsSlash(fromFilePath)
    toFilePath = removeBothEndsSlash(toFilePath)

    StorageService.validateNodePath(toFilePath)

    // 移動元ファイルの存在確認
    const fileNode = await this.getFileNode({ path: fromFilePath })
    if (!fileNode) {
      throw new Error(`The source file does not exist: '${fromFilePath}'`)
    }

    // 移動先の所属ディレクトリの存在確認
    // ※バケット直下への移動時はディレクトリの存在確認はしない
    const toParentPath = removeStartDirChars(_path.dirname(toFilePath))
    if (toParentPath) {
      const toParentNode = await this.getNode({ path: toParentPath })
      if (!toParentNode) {
        throw new Error(`The destination directory does not exist: '${toParentPath}'`)
      }
    }

    // 移動先に同名のファイルが存在している場合
    const existingToFileNode = await this.getNode({ path: toFilePath })
    if (existingToFileNode) {
      // 移動先の同名ファイルは削除
      // ・データベースからファイルノードを削除
      await this.client.delete({
        index: StorageService.IndexAlias,
        id: existingToFileNode.id,
        refresh: true,
      })
      // ・ストレージからファイルを削除
      const bucket = admin.storage().bucket()
      const file = bucket.file(existingToFileNode.id)
      await file.delete({ ignoreNotFound: true })
    }

    // データベースの移動元ファイルノードのパスを移動先のパスへ変更
    const version = fileNode.version + 1
    await this.client.update({
      index: StorageService.IndexAlias,
      id: fileNode.id,
      body: {
        doc: {
          ...this.getSaveBaseStorageNode({
            id: fileNode.id,
            path: toFilePath,
          }),
          version,
        },
      },
      refresh: true,
    })

    // 移動したストレージファイルのメタデータを更新
    const { file: movedFile } = await this.getStorageFile(fileNode.id)
    await this.saveMetadata(movedFile, { version })

    return this.sgetFileNode({ id: fileNode.id })
  }

  /**
   * ディレクトリの名前変更を行います。
   *
   * 引数が次のように指定された場合、
   *   + dirNode: 'home/photos'
   *   + newName: 'my-photos'
   *
   * 次のようなディレクトリの名前変更が行われます。
   *   + 変更前: 'home/photos'
   *   + 変更後: 'home/my-photos'
   *
   * リネームするディレクトリがない場合、リネームは行われず、空配列が返されます。
   *
   * @param dirPath
   * @param newName
   * @param input
   */
  async renameDir(dirPath: string, newName: string, input?: { maxChunk?: number }): Promise<void> {
    dirPath = removeBothEndsSlash(dirPath)

    StorageService.validateNodeName(newName)

    // リネームした際のパスを作成
    const reg = new RegExp(`${_path.basename(dirPath)}$`)
    const toDirPath = dirPath.replace(reg, newName)

    // 既に同じ名前のディレクトリがある場合
    const toDirNode = await this.getNode({ path: toDirPath })
    if (toDirNode) {
      throw new Error(`The specified directory name already exists: '${dirPath}' -> '${toDirPath}'`)
    }

    return await this.moveDir(dirPath, toDirPath, input)
  }

  /**
   * ファイルの名前変更を行います。
   *
   * 引数が次のように指定された場合、
   *   + filePath: 'photos/family.png'
   *   + newName: 'my-family.png'
   *
   * 次のような名前変更が行われます。
   *   + 変更前: 'photos/family.png'
   *   + 変更後: 'photos/my-family.png'
   *
   * リネームするファイルがない場合、移動行われず、戻り値は何も返しません。
   *
   * @param filePath
   * @param newName
   */
  async renameFile(filePath: string, newName: string): Promise<FILE_NODE> {
    filePath = removeBothEndsSlash(filePath)

    StorageService.validateNodeName(newName)

    // リネームした際のパスを作成
    const reg = new RegExp(`${_path.basename(filePath)}$`)
    const toFilePath = filePath.replace(reg, newName)

    // 既に同じ名前のファイルがある場合
    const toFileNode = await this.getFileNode({ path: toFilePath })
    if (toFileNode) {
      throw new Error(`The specified file name already exists: '${filePath}' -> '${toFilePath}'`)
    }

    return await this.moveFile(filePath, toFilePath)
  }

  /**
   * ディレクトリに対して共有設定を行います。
   * @param dirPath
   * @param input
   */
  async setDirShareSettings(dirPath: string, input: StorageNodeShareSettingsInput | null): Promise<NODE> {
    dirPath = removeBothEndsSlash(dirPath)

    const dirNode = await this.getNode({ path: dirPath })
    if (!dirNode) {
      throw new Error(`The specified directory does not exist: '${dirPath}'`)
    }

    StorageService.validateShareSettingInput(input)

    await this.client.update({
      index: StorageService.IndexAlias,
      id: dirNode.id,
      body: {
        doc: {
          ...this.getSaveBaseStorageNode({
            id: dirNode.id,
            path: dirPath,
            share: input === null ? null : { ...dirNode.share, ...input },
          }),
          version: dirNode.version + 1,
        },
      },
      refresh: true,
    })

    return await this.sgetNode({ id: dirNode.id })
  }

  /**
   * ファイルに対して共有設定を行います。
   * @param filePath
   * @param input
   */
  async setFileShareSettings(filePath: string, input: StorageNodeShareSettingsInput | null): Promise<FILE_NODE> {
    filePath = removeBothEndsSlash(filePath)

    let fileNode = await this.getFileNode({ path: filePath })
    if (!fileNode) {
      throw new Error(`The specified file does not exist: '${filePath}'`)
    }

    StorageService.validateShareSettingInput(input)

    await this.client.update({
      index: StorageService.IndexAlias,
      id: fileNode.id,
      body: {
        doc: {
          ...this.getSaveBaseStorageNode({
            id: fileNode.id,
            path: filePath,
            share: input === null ? null : Object.assign(fileNode.share, input),
          }),
          version: fileNode.version + 1,
        },
      },
      refresh: true,
    })
    fileNode = await this.sgetFileNode({ id: fileNode.id })

    await this.saveMetadata(fileNode.file, {
      version: fileNode.version,
    })

    return fileNode
  }

  /**
   * ファイルアップロードの後に必要な処理を行います。
   * @param input
   */
  async handleUploadedFile(input: StorageNodeKeyInput): Promise<FILE_NODE> {
    const { id: nodeId, path: nodePath } = input

    // 指定されたパスの検証
    StorageService.validateNodePath(nodePath)

    // ストレージにファイルが存在することを確認
    const { file, exists } = await this.getStorageFile(nodeId)
    if (!exists) {
      throw new InputValidationError(`Uploaded file not found.`, input)
    }

    // ファイルを格納するディレクトリが存在することを検証
    const parentPath = removeStartDirChars(_path.dirname(nodePath))
    const dirNodes = await this.getRequiredHierarchicalDirNodes(parentPath)
    for (const dirNode of dirNodes) {
      if (!dirNode.exists) {
        // ファイルの祖先であるディレクトリが一部でも欠けている状態では、そのファイルはツリーをだどって
        // 到達できない迷子のファイルになってしまう。このため対象ファイルはストレージから削除する。
        await file.delete()
        // 例外をスロー
        throw new InputValidationError(`The ancestor directory of the file does not exist.`, {
          fileNodePath: nodePath,
          ancestorPath: dirNode.path,
        })
      }
    }

    // データベースのファイルノード作成/更新
    const fileNode = await this.saveFileNode(nodePath, file)

    return fileNode as FILE_NODE
  }

  /**
   * 署名付きのアップロードURLを取得します。
   * @param requestOrigin
   * @param inputs
   */
  async getSignedUploadUrls(requestOrigin: string, inputs: SignedUploadUrlInput[]): Promise<string[]> {
    const bucket = admin.storage().bucket()
    const urlDict: { [id: string]: string } = {}

    for (const input of inputs) {
      const { id: nodeId, contentType } = input

      // ファイルノードの新バージョン番号を取得
      const fileNode = await this.getNode({ id: nodeId })
      const version = (fileNode?.version ?? 0) + 1

      const gcsFileNode = bucket.file(nodeId)
      const [url] = await gcsFileNode.createResumableUpload({
        origin: requestOrigin,
        metadata: {
          contentType,
          metadata: StorageService.toGCSMetadata({ version }),
        },
      })
      urlDict[nodeId] = url
    }

    return inputs.map(input => urlDict[input.id])
  }

  //--------------------------------------------------
  //  Utilities
  //--------------------------------------------------

  /**
   * ファイルをクライアントへストリーミング(レスポンス)します。
   * @param req
   * @param res
   * @param file
   */
  async streamFile(req: Request, res: Response, file: string | FILE_NODE): Promise<Response> {
    let fileNode: FILE_NODE | undefined
    if (typeof file === 'string') {
      const filePath = file
      fileNode = await this.getFileNode({ path: filePath })
    } else {
      fileNode = file
    }

    if (!fileNode) {
      return res.sendStatus(404)
    }

    const lastModified = fileNode.updatedAt.toString()
    const ifModifiedSinceStr = req.header('If-Modified-Since')
    const ifModifiedSince = ifModifiedSinceStr ? dayjs(ifModifiedSinceStr).toString() : undefined
    if (lastModified === ifModifiedSince) {
      return res.sendStatus(304)
    }

    res.setHeader('Last-Modified', lastModified)
    res.setHeader('Content-Type', fileNode.contentType)
    // TODO
    //  ローカル環境でContent-Lengthを指定するとなぜかタイムアウトエラーが発生する。
    //  本番環境ではタイムアウトエラーは発生しないので、本番時のみContent-Lengthを設定している。
    if (config.env.mode === 'prod') {
      res.setHeader('Content-Length', fileNode.file.metadata.size)
    }
    const fileStream = fileNode.file.createReadStream()

    fileStream.pipe(res)
    return res
  }

  /**
   * 指定されたデータをファイルとしてストレージへアップロードします。
   * @param uploadList
   */
  async uploadDataItems(uploadList: StorageUploadDataItem[]): Promise<FILE_NODE[]> {
    const dirPaths = uploadList
      .map(uploadItem => {
        return removeStartDirChars(_path.dirname(uploadItem.path))
      })
      .filter(dirPath => Boolean(dirPath))
    const hierarchicalDirNodes = await this.getRequiredHierarchicalDirNodes(...dirPaths)
    for (const dirNode of hierarchicalDirNodes) {
      if (!dirNode.exists) {
        throw new InputValidationError(`The directory '${dirNode.path}' to upload to does not exist.`)
      }
    }

    const uploadedFileDict: { [path: string]: FILE_NODE } = {}
    for (const chunk of splitArrayChunk(uploadList, StorageService.MaxChunk)) {
      await Promise.all(
        chunk.map(async uploadItem => {
          const fileNode = await this.saveStorageFileNode({
            fileNodePath: uploadItem.path,
            dataParams: {
              data: uploadItem.data,
              options: { contentType: uploadItem.contentType },
            },
            share: uploadItem.share,
          })
          uploadedFileDict[fileNode.path] = fileNode
        })
      )
    }

    return uploadList.reduce((result, item) => {
      result.push(uploadedFileDict[item.path])
      return result
    }, [] as FILE_NODE[])
  }

  /**
   * ローカルファイルをストレージへアップロードします。
   * @param uploadList
   */
  async uploadLocalFiles(uploadList: { localFilePath: string; fileNodePath: string }[]): Promise<FILE_NODE[]> {
    const dirPaths = uploadList
      .map(uploadItem => {
        return removeStartDirChars(_path.dirname(uploadItem.fileNodePath))
      })
      .filter(dirPath => Boolean(dirPath))
    const hierarchicalDirNodes = await this.getRequiredHierarchicalDirNodes(...dirPaths)
    for (const dirNode of hierarchicalDirNodes) {
      if (!dirNode.exists) {
        throw new InputValidationError(`The directory '${dirNode.path}' to upload to does not exist.`)
      }
    }

    const uploadedFileDict: { [path: string]: FILE_NODE } = {}
    const bucket = admin.storage().bucket()
    for (const chunk of splitArrayChunk(uploadList, StorageService.MaxChunk)) {
      await Promise.all(
        chunk.map(async uploadItem => {
          const { localFilePath, fileNodePath } = uploadItem
          const nodeId = StorageService.generateNodeId()
          const response = await bucket.upload(localFilePath, { destination: nodeId })
          const [file, metadata] = response
          const fileNode = await this.saveFileNode(uploadItem.fileNodePath, file)
          uploadedFileDict[fileNode.path] = fileNode
        })
      )
    }

    return uploadList.reduce<FILE_NODE[]>((result, item) => {
      result.push(uploadedFileDict[item.fileNodePath])
      return result
    }, [])
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  /**
   * 指定されたディレクトリの階層構造を形成するのに必要なノードを取得します。
   * @param dirPaths
   */
  protected async getRequiredHierarchicalDirNodes(...dirPaths: string[]): Promise<(NODE & { exists: boolean })[]> {
    // 指定ディレクトリの階層構造を形成するのに必要なノードパスを取得
    const hierarchicalPaths = splitHierarchicalPaths(...dirPaths)

    // 上記で取得したパスのノードをデータベースから取得
    const nodes = await this.getNodes({ paths: hierarchicalPaths })
    const nodeDict = arrayToDict(nodes, 'path')

    // 戻り値用に加工
    const hierarchicalNodes: (NODE & { exists: boolean })[] = []
    for (const path of hierarchicalPaths) {
      const node = nodeDict[path]
      if (node) {
        hierarchicalNodes.push({ ...node, exists: true })
      } else {
        hierarchicalNodes.push({
          ...this.dirPathToStorageNode(path),
          exists: false,
        })
      }
    }

    // ディレクトリ階層に従ってソート
    return StorageService.sortNodes(hierarchicalNodes)
  }

  /**
   * 指定されたノードをもとに、上位ディレクトリを加味した共有設定を取得します。
   * @param hierarchicalNodes
   *   階層構造が形成されたノードリストを指定。最後尾のノードの共有設定が取得されます。
   */
  protected getInheritedShareSettings(hierarchicalNodes: StorageNode[]): Required<StorageNodeShareSettings> {
    hierarchicalNodes = StorageService.sortNodes([...hierarchicalNodes])

    const result: Required<StorageNodeShareSettings> = { isPublic: false, readUIds: null, writeUIds: null }
    for (const node of hierarchicalNodes) {
      if (typeof node.share.isPublic === 'boolean') {
        result.isPublic = node.share.isPublic
      }
      if (node.share.readUIds) {
        result.readUIds = node.share.readUIds
      }
      if (node.share.writeUIds) {
        result.writeUIds = node.share.writeUIds
      }
    }

    return result
  }

  /**
   * ストレージに格納されているファイルをもとに、データベースのファイルノードを作成/更新します。
   * @param fileNodePath
   * @param file
   * @param input
   */
  async saveFileNode(fileNodePath: string, file: File, input?: { share?: StorageNodeShareSettingsInput }): Promise<FILE_NODE> {
    fileNodePath = removeBothEndsSlash(fileNodePath)

    const nodeId = file.name
    const existsFileNode = await this.getNode({ id: nodeId })
    const { version } = StorageService.extractMetaData(file)

    // クライアント側ではアップロード前に引数ファイルのメタデータに新バージョン番号が書き込まれる。
    // この新バージョン番頭と現在のストレージファイルのバージョン番号を比較し、
    // 新バージョン番号がストレージファイルと同じまたは古い場合は何もせず終了
    if (existsFileNode && existsFileNode.version >= version) {
      return { ...existsFileNode, file } as FILE_NODE
    }

    const now = dayjs().toISOString()
    await this.client.update({
      index: StorageService.IndexAlias,
      id: nodeId,
      body: {
        doc: {
          ...(this.getSaveBaseStorageNode({
            id: nodeId,
            path: fileNodePath,
            share: input?.share ?? existsFileNode?.share ?? StorageService.EmptyShareSettings,
          }) as RequiredAre<WriteBaseStorageNode, 'share'>),
          nodeType: StorageNodeType.File,
          contentType: file.metadata.contentType ?? '',
          size: file.metadata.size ? Number(file.metadata.size) : 0,
          articleNodeName: null,
          articleNodeType: null,
          articleSortOrder: null,
          isArticleFile: existsFileNode?.isArticleFile ?? false,
          version,
          createdAt: existsFileNode?.createdAt ?? now,
          updatedAt: now,
        },
        doc_as_upsert: true,
      },
      refresh: true,
    })

    return {
      ...((await this.getNode({ id: nodeId })) as NODE),
      file,
    } as FILE_NODE
  }

  /**
   * ストレージとデータベースへファイルノードを保存します。
   * @param params
   */
  protected async saveStorageFileNode(params: {
    fileNodePath: string
    isArticleFile?: boolean
    dataParams: { data: any; options?: SaveOptions }
    share?: StorageNodeShareSettingsInput
  }): Promise<FILE_NODE> {
    const fileNodePath = removeBothEndsSlash(params.fileNodePath)
    const isArticleFile = params.isArticleFile ?? false
    const { dataParams, share } = params

    const fileNode = await this.getNode({ path: fileNodePath })
    const nodeId = fileNode?.id || StorageService.generateNodeId()
    let version = 0

    //
    // ストレージにファイルのコンテンツデータを保存
    //
    const bucket = admin.storage().bucket()
    const file = bucket.file(nodeId)

    let metadata: StorageFileMetadata
    if (fileNode) {
      version = fileNode.version + 1
      metadata = {
        ...StorageService.extractMetaData(file),
        version,
      }
    } else {
      version = 1
      metadata = { version }
    }

    await file.save(dataParams.data, dataParams.options)
    await this.saveMetadata(file, metadata)

    //
    // ストアにノードデータを保存
    //
    const now = dayjs().toISOString()
    await this.client.update({
      index: StorageService.IndexAlias,
      id: nodeId,
      body: {
        doc: {
          ...(this.getSaveBaseStorageNode({
            id: nodeId,
            path: fileNodePath,
            share: share ?? fileNode?.share ?? StorageService.EmptyShareSettings,
          }) as RequiredAre<WriteBaseStorageNode, 'share'>),
          nodeType: StorageNodeType.File,
          contentType: dataParams?.options?.contentType ?? '',
          size: file.metadata.size ? Number(file.metadata.size) : 0,
          articleNodeName: null,
          articleNodeType: null,
          articleSortOrder: null,
          isArticleFile,
          version,
          createdAt: fileNode?.createdAt ?? now,
          updatedAt: now,
        },
        doc_as_upsert: true,
      },
      refresh: true,
    })

    // 保存されたノードデータを戻り値として返す
    return {
      ...((await this.getNode({ id: nodeId })) as NODE),
      file,
    } as FILE_NODE
  }

  /**
   * ストアノード保存時の基本項目が設定されたオブジェクトを取得します。
   * @param node
   */
  protected getSaveBaseStorageNode(node: { id: string; path: string; share?: StorageNodeShareSettingsInput | null }): WriteBaseStorageNode {
    return {
      id: node.id,
      name: _path.basename(node.path),
      dir: removeStartDirChars(_path.dirname(node.path)),
      path: node.path,
      level: StorageService.getNodeLevel(node.path),
      share: this.toStoreShareSettings(node.share),
    }
  }

  /**
   * 指定された`dirPath`を`StorageNode`へ変換します。
   * @param dirPath
   */
  protected dirPathToStorageNode(dirPath: string): NODE {
    dirPath = removeBothEndsSlash(dirPath)
    const name = _path.basename(dirPath)
    const dir = removeStartDirChars(_path.dirname(dirPath))

    return {
      id: '',
      nodeType: StorageNodeType.Dir,
      name,
      dir,
      path: dirPath,
      level: StorageService.getNodeLevel(dirPath),
      contentType: '',
      size: 0,
      share: { isPublic: null, readUIds: null, writeUIds: null },
      articleNodeName: null,
      articleNodeType: null,
      articleSortOrder: null,
      isArticleFile: false,
      version: 0,
      createdAt: dayjs(0),
      updatedAt: dayjs(0),
    } as NODE
  }

  /**
   * データベースから取得したノードの形式をアプリケーションで扱われる形式へ変換します。
   * @param rawNode
   * @protected
   */
  protected toNode(rawNode: RawStorageNode): NODE | undefined {
    if (!rawNode) return undefined
    return {
      ...rawNode,
      share: rawNode.share || { isPublic: null, readUIds: null, writeUIds: null },
      articleNodeName: rawNode.articleNodeName ?? null,
      articleNodeType: rawNode.articleNodeType ?? null,
      articleSortOrder: rawNode.articleSortOrder ?? null,
      isArticleFile: rawNode.isArticleFile ?? false,
      createdAt: dayjs(rawNode.createdAt),
      updatedAt: dayjs(rawNode.updatedAt),
    } as NODE
  }

  /**
   * データベースのレスポンスデータからノードリストを取得します。
   * @param response
   */
  protected responseToNodes(response: ElasticResponse<RawStorageNode>): NODE[] {
    if (!response.body.hits.hits.length) return []
    return response.body.hits.hits.map(hit => this.toNode(hit._source)!)
  }

  /**
   * 共有設定の入力値をストアの格納形式に変換します。
   * @param input
   */
  protected toStoreShareSettings(input?: StorageNodeShareSettingsInput | null): StorageNodeShareSettings {
    let share!: StorageNodeShareSettings

    if (input === null) {
      share = { isPublic: null, readUIds: null, writeUIds: null }
    } else if (input) {
      share = { isPublic: null, readUIds: null, writeUIds: null }
      if (typeof input.isPublic !== 'undefined') {
        share.isPublic = input.isPublic
      }
      if (typeof input.readUIds !== 'undefined') {
        if (Array.isArray(input.readUIds) && input.readUIds.length === 0) {
          share.readUIds = null
        } else {
          share.readUIds = input.readUIds
        }
      }
      if (typeof input.writeUIds !== 'undefined') {
        if (Array.isArray(input.writeUIds) && input.writeUIds.length === 0) {
          share.writeUIds = null
        } else {
          share.writeUIds = input.writeUIds
        }
      }
    }

    return share
  }

  //--------------------------------------------------
  //  Metadata
  //--------------------------------------------------

  /**
   * 指定されたストレージファイルのメタデータを保存します。
   * @param file
   * @param input
   */
  protected async saveMetadata(file: File, input: StorageFileMetadataInput): Promise<StorageFileMetadata> {
    const metadata = StorageService.extractMetaData(file)

    if (typeof input.version === 'number') {
      metadata.version = input.version
    }

    await file.setMetadata({ metadata: StorageService.toGCSMetadata(metadata) })

    return metadata
  }

  //----------------------------------------------------------------------
  //
  //  Static
  //
  //----------------------------------------------------------------------

  static MaxChunk = 50

  static EmptyShareSettings: StorageNodeShareSettings = {
    isPublic: null,
    readUIds: null,
    writeUIds: null,
  }

  /**
   * 各環境ごとのElasticsearchのインデックス名です。
   */
  static readonly IndexAliases = {
    prod: `${Entities.StorageNodes.Name}`,
    dev: `${Entities.StorageNodes.Name}`,
    test: `${Entities.StorageNodes.Name}-test`,
  }

  /**
   * Elasticsearchのインデックス名です。
   */
  static readonly IndexAlias = StorageService.IndexAliases[config.env.mode]

  /**
   * Elasticsearchのインデックス定義です。
   */
  static readonly IndexDefinition = IndexDefinition

  /**
   * ノードIDを生成します。
   */
  static generateNodeId(): string {
    return generateEntityId(this.IndexAlias)
  }

  /**
   * ストアノードレベルを取得します。
   * @param nodePath
   */
  static getNodeLevel(nodePath: string | null): number {
    nodePath = removeBothEndsSlash(nodePath)
    return nodePath.split('/').length
  }

  /**
   * ノードパスの検証を行います。
   * @param nodePath
   */
  static validateNodePath(nodePath?: string): void {
    if (!nodePath) {
      throw new InputValidationError('The specified path is empty.')
    }

    // 改行、タブが含まれないことを検証
    if (/\r?\n|\t/g.test(nodePath)) {
      throw new InputValidationError('The specified path is invalid.', {
        path: nodePath,
      })
    }
  }

  /**
   * ノード名の検証を行います。
   * @param nodeName
   */
  static validateNodeName(nodeName?: string): void {
    if (!nodeName) {
      throw new InputValidationError('The specified node name is empty.')
    }

    // 改行、タブが含まれないことを検証
    if (/\r?\n|\t/g.test(nodeName)) {
      throw new InputValidationError('The specified node name is invalid.', {
        nodeName,
      })
    }

    // '/'が含まれないことを検証
    if (/\//g.test(nodeName!)) {
      throw new InputValidationError('The specified directory name is invalid.', { nodeName })
    }
  }

  /**
   * 共有設定の入力値を検証します。
   * @param input
   */
  static validateShareSettingInput(input?: StorageNodeShareSettingsInput | null): void {
    input?.readUIds?.forEach(uid => {
      if (!validateUID(uid)) {
        throw new Error(`The specified 'readUIds' had an incorrect value: '${uid}'`)
      }
    })

    input?.writeUIds?.forEach(uid => {
      if (!validateUID(uid)) {
        throw new Error(`The specified 'writeUIds' had an incorrect value: '${uid}'`)
      }
    })
  }

  /**
   * ノード配列をディレクトリ階層に従ってソートします。
   * @param nodes
   */
  static sortNodes<NODE extends StorageNode>(nodes: NODE[]): NODE[] {
    nodes.sort((a, b) => {
      // ソート用文字列(strA, strB)の説明:
      //   ノードがファイルの場合、同じ階層にあるディレクトリより順位を下げるために
      //   大きな文字コード'0xffff'を付加している。これにより同一階層のファイルと
      //   ディレクトリを比較した際、ファイルの方が文字的に大きいと判断され、下の方へ
      //   配置されることになる。

      let strA = a.path
      let strB = b.path
      if (a.nodeType === StorageNodeType.File) {
        strA = `${a.dir}${String.fromCodePoint(0xffff)}${a.name}`
      }
      if (b.nodeType === StorageNodeType.File) {
        strB = `${b.dir}${String.fromCodePoint(0xffff)}${b.name}`
      }

      return strA < strB ? -1 : strA > strB ? 1 : 0
    })
    return nodes
  }

  /**
   * ノードをデータベースへ保存するプロパティのみに絞り込みます。
   * @param node
   */
  static toDBNode(node: StorageNode): StorageNode {
    return {
      id: node.id,
      nodeType: node.nodeType,
      name: node.name,
      dir: node.dir,
      path: node.path,
      level: node.level,
      contentType: node.contentType,
      size: node.size,
      share: node.share,
      articleNodeName: node.articleNodeName,
      articleNodeType: node.articleNodeType,
      articleSortOrder: node.articleSortOrder,
      isArticleFile: node.isArticleFile,
      version: node.version,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    }
  }

  /**
   * 指定されたストレージファイルからメタデータを取得します。
   * @param file
   */
  static extractMetaData(file: File): StorageFileMetadata {
    const metadata = file.metadata.metadata || {}

    const result: StorageFileMetadata = {
      version: metadata.version && !isNaN(metadata.version) ? Number(metadata.version) : 0,
    }

    return result
  }

  /**
   * メタデータをGCSへ保存できる形式へ変換します。
   * @param input
   */
  static toGCSMetadata(input: StorageFileMetadataInput): StorageFileRawMetadata {
    const result: StorageFileRawMetadata = { version: '' }

    if (typeof input.version === 'number') {
      result.version = input.version.toString()
    }

    return result
  }
}

namespace StorageServiceDI {
  export const symbol = Symbol(StorageService.name)
  export const provider = {
    provide: symbol,
    useClass: StorageService,
  }
  export type type = StorageService
}

@Module({
  providers: [StorageServiceDI.provider],
  exports: [StorageServiceDI.provider],
  imports: [AuthServiceModule],
})
class StorageServiceModule {}

//----------------------------------------------------------------------
//
//  Methods
//
//----------------------------------------------------------------------

export { StorageService, StorageServiceDI, StorageServiceModule }
export { StorageFileNode, StorageUploadDataItem, RawStorageNode }
