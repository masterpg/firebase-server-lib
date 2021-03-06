import * as _path from 'path'
import * as admin from 'firebase-admin'
import { AppError, validateUID } from '../base'
import { AuthServiceDI, AuthServiceModule } from './base-services/auth'
import {
  CoreStorageNode,
  CreateStorageNodeOptions,
  IdToken,
  SignedUploadUrlInput,
  StorageNodeGetKeyInput,
  StorageNodeGetKeysInput,
  StorageNodeGetUnderInput,
  StorageNodeKeyInput,
  StorageNodeShareSettings,
  StorageNodeShareSettingsInput,
  StorageNodeType,
  StoragePaginationInput,
  StoragePaginationResult,
  UserIdClaims,
} from './base'
import { CoreStorageSchema, UserHelper } from './base'
import {
  ElasticMSearchAPIResponse,
  ElasticPageToken,
  ElasticSearchAPIResponse,
  ElasticSearchResponse,
  closePointInTime,
  decodePageToken,
  encodePageToken,
  extractSearchAfter,
  isPaginationTimeout,
  newElasticClient,
  openPointInTime,
  toElasticTimestamp,
  validateBulkResponse,
} from '../base/elastic'
import { File, SaveOptions } from '@google-cloud/storage'
import { ForbiddenException, Inject, Module, UnauthorizedException } from '@nestjs/common'
import { Request, Response } from 'express'
import { arrayToDict, removeBothEndsSlash, removeStartDirChars, splitArrayChunk, splitHierarchicalPaths, summarizeFamilyPaths } from 'web-base-lib'
import { AuthHelper } from './base/auth'
import { config } from '../../config'
import dayjs = require('dayjs')
import DBStorageNode = CoreStorageSchema.DBStorageNode

//========================================================================
//
//  Interfaces
//
//========================================================================

interface StorageFileNode extends CoreStorageNode {
  file: File
}

interface StorageFileDetail {
  file: File
  exists: boolean
}

interface StorageUploadDataItem {
  data: string | Buffer
  path: string
  contentType: string
  share?: StorageNodeShareSettingsInput
}

interface ValidateBrowsableTarget {
  nodeId?: string
  nodeIds?: string[]
  dirId?: string
  dirIds?: string[]
  fileId?: string
  fileIds?: string[]
  nodePath?: string
  nodePaths?: (string | undefined)[]
  dirPath?: string
  dirPaths?: (string | undefined)[]
  filePath?: string
  filePaths?: (string | undefined)[]
  node?: CoreStorageNode
  nodes?: CoreStorageNode[]
}

//========================================================================
//
//  Implementation
//
//========================================================================

class CoreStorageService<
  NODE extends CoreStorageNode = CoreStorageNode,
  FILE_NODE extends NODE & StorageFileNode = NODE & StorageFileNode,
  DB_NODE extends DBStorageNode = DBStorageNode
> {
  constructor(@Inject(AuthServiceDI.symbol) protected readonly authService: AuthServiceDI.type) {}

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  protected readonly client = newElasticClient()

  protected readonly userHelper = new UserHelper(this.client)

  /**
   * データベースからの取得ノードに含めるフィールドを指定します。
   */
  protected get includeNodeFields(): string[] {
    return []
  }

  /**
   * データベースからの取得ノードで除外するフィールドを指定します。
   */
  protected get excludeNodeFields(): string[] {
    return []
  }

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  /**
   * 指定されたノードを取得します。
   * @param idToken
   * @param input
   */
  getNode(idToken: IdToken, input: StorageNodeGetKeyInput): Promise<NODE | undefined>

  /**
   * @see getNode
   * @param input
   */
  getNode(input: StorageNodeGetKeyInput): Promise<NODE | undefined>

  async getNode(arg1: IdToken | StorageNodeGetKeyInput, arg2?: StorageNodeGetKeyInput): Promise<NODE | undefined> {
    const getNode_ = async (input: StorageNodeGetKeyInput) => {
      const id = input.id
      const path = removeBothEndsSlash(input.path)

      const response = await this.client.search<ElasticSearchResponse<DB_NODE>>({
        index: CoreStorageSchema.IndexAlias,
        body: {
          query: {
            term: id ? { _id: id } : { path },
          },
        },
        _source_includes: this.includeNodeFields,
        _source_excludes: this.excludeNodeFields,
      })

      const nodes = this.dbResponseToNodes(response)
      return nodes.length ? nodes[0] : undefined
    }

    let idToken: IdToken | undefined
    let input: StorageNodeGetKeyInput
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      input = arg2!
    } else {
      input = arg1
    }

    if (!input.id && !input.path) {
      return undefined
    }

    if (input.id) {
      const node = await getNode_({ id: input.id })
      if (!node) return
      idToken && (await this.validateBrowsable(idToken, node.path))
      return node
    } else {
      idToken && (await this.validateBrowsable(idToken, input.path))
      return getNode_({ path: input.path })
    }
  }

  /**
   * 指定されたノードを取得します。
   * 指定されたノードが見つからなかった場合、例外がスローされます。
   * @param idToken
   * @param input
   */
  sgetNode(idToken: IdToken, input: StorageNodeGetKeyInput): Promise<NODE>

  /**
   * @see sgetNode
   * @param input
   */
  sgetNode(input: StorageNodeGetKeyInput): Promise<NODE>

  async sgetNode(arg1: IdToken | StorageNodeGetKeyInput, arg2?: StorageNodeGetKeyInput): Promise<NODE> {
    let idToken: IdToken | undefined
    let input: StorageNodeGetKeyInput
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      input = arg2!
    } else {
      input = arg1
    }

    if (!input.id && !input.path) {
      throw new AppError(`Either 'id' or 'path' must be specified.`)
    }

    const node = await this.getNode(input)
    if (!node) {
      throw new AppError(`There is no node in the specified key.`, { key: input })
    }

    if (idToken) {
      await this.validateBrowsable(idToken, node.path)
    }

    return node
  }

  /**
   * 指定されたノードリストを取得します。
   * @param idToken
   * @param input
   */
  getNodes(idToken: IdToken, input: StorageNodeGetKeysInput): Promise<NODE[]>

  /**
   * @see getNodes
   * @param input
   */
  getNodes(input: StorageNodeGetKeysInput): Promise<NODE[]>

  async getNodes(arg1: IdToken | StorageNodeGetKeysInput, arg2?: StorageNodeGetKeysInput): Promise<NODE[]> {
    const getNodes_ = async (input: StorageNodeGetKeysInput) => {
      const ids = input.ids || []
      const paths = input.paths || []
      const size = 1000

      const nodes: NODE[] = []
      for (const chunk of splitArrayChunk(ids, size)) {
        if (!chunk.length) break
        const response = await this.client.search<ElasticSearchResponse<DB_NODE>>({
          index: CoreStorageSchema.IndexAlias,
          size,
          body: {
            query: { terms: { id: chunk } },
          },
          _source_includes: this.includeNodeFields,
          _source_excludes: this.excludeNodeFields,
        })
        nodes.push(...this.dbResponseToNodes(response))
      }
      for (const chunk of splitArrayChunk(paths, size)) {
        if (!chunk.length) break
        const response = await this.client.search<ElasticSearchResponse<DB_NODE>>({
          index: CoreStorageSchema.IndexAlias,
          size,
          body: {
            query: { terms: { path: chunk } },
          },
          _source_includes: this.includeNodeFields,
          _source_excludes: this.excludeNodeFields,
        })
        nodes.push(...this.dbResponseToNodes(response))
      }

      const nodeIdDict: { [id: string]: NODE } = {}
      const nodePathDict: { [id: string]: NODE } = {}
      for (const node of nodes) {
        nodeIdDict[node.id] = node
        nodePathDict[node.path] = node
      }

      const result: NODE[] = []
      for (const id of ids) {
        const node = nodeIdDict[id]
        node && result.push(node)
      }
      for (const path of paths) {
        const node = nodePathDict[path]
        node && result.push(node)
      }

      return result
    }

    let idToken: IdToken | undefined
    let input: StorageNodeGetKeysInput
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      input = arg2!
    } else {
      input = arg1
    }

    const nodes = await getNodes_(input)

    if (idToken) {
      await this.validateBrowsable(
        idToken,
        nodes.map(node => node.path)
      )
    }

    return nodes
  }

  /**
   * 指定されたファイルノードを取得します。
   * @param idToken
   * @param input
   */
  getFileNode(idToken: IdToken, input: StorageNodeGetKeyInput): Promise<FILE_NODE | undefined>

  /**
   * @see getFileNode
   * @param input
   */
  getFileNode(input: StorageNodeGetKeyInput): Promise<FILE_NODE | undefined>

  async getFileNode(arg1: IdToken | StorageNodeGetKeyInput, arg2?: StorageNodeGetKeyInput): Promise<FILE_NODE | undefined> {
    let idToken: IdToken | undefined
    let input: StorageNodeGetKeyInput
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      input = arg2!
    } else {
      input = arg1
    }

    let fileNode: NODE | undefined
    if (idToken) {
      fileNode = await this.getNode(idToken, input)
    } else {
      fileNode = await this.getNode(input)
    }
    if (!fileNode) return undefined

    const { file, exists } = await this.getStorageFile(fileNode.id)
    if (!exists) return undefined

    return { ...fileNode, file } as FILE_NODE
  }

  /**
   * @see sgetFileNode
   * @param idToken
   * @param input
   */
  sgetFileNode(idToken: IdToken, input: StorageNodeGetKeyInput): Promise<FILE_NODE>

  /**
   * 指定されたファイルノードを取得します。
   * 指定されたファイルノードが見つからなかった場合、例外がスローされます。
   * @param input
   */
  sgetFileNode(input: StorageNodeGetKeyInput): Promise<FILE_NODE>

  async sgetFileNode(arg1: IdToken | StorageNodeGetKeyInput, arg2?: StorageNodeGetKeyInput): Promise<FILE_NODE> {
    let idToken: IdToken | undefined
    let input: StorageNodeGetKeyInput
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      input = arg2!
    } else {
      input = arg1
    }

    let node: FILE_NODE | undefined
    if (idToken) {
      node = await this.getFileNode(idToken, input)
    } else {
      node = await this.getFileNode(input)
    }

    if (!node) {
      throw new AppError(`There is no node in the specified key.`, { key: input })
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

    return { file, exists }
  }

  /**
   * 指定されたディレクトリ配下のノードを取得します。
   * @param idToken
   * @param input
   * @param pagination
   */
  async getDescendants(idToken: IdToken, input: StorageNodeGetUnderInput, pagination?: StoragePaginationInput): Promise<StoragePaginationResult<NODE>>

  /**
   * @see getDescendants
   * @param input
   * @param pagination
   */
  async getDescendants(input: StorageNodeGetUnderInput, pagination?: StoragePaginationInput): Promise<StoragePaginationResult<NODE>>

  async getDescendants(
    arg1: IdToken | StorageNodeGetUnderInput,
    arg2?: StorageNodeGetUnderInput | StoragePaginationInput,
    arg3?: StoragePaginationInput
  ): Promise<StoragePaginationResult<NODE>> {
    let idToken: IdToken | undefined
    let input: StorageNodeGetUnderInput
    let pagination: StoragePaginationInput | undefined
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      input = arg2 as StorageNodeGetUnderInput
      pagination = arg3
    } else {
      input = arg1
      pagination = arg2 as StoragePaginationInput | undefined
    }

    let path: string
    const includeBase = input.includeBase

    if (input.id) {
      const node = await this.getNode({ id: input.id })
      if (!node) return { list: [] }
      path = node.path
    } else {
      path = input.path!
    }

    if (!input.id && typeof input.path !== 'string') {
      throw new AppError(`Either 'id' or 'path' must be specified.`)
    }

    if (idToken) {
      await this.validateBrowsable(idToken, path)

      // 自身が保持するノードを検索しようとしている場合
      // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
      if (CoreStorageService.isOwnUserRootUnder(idToken, path) || idToken.isAppAdmin) {
        return this.getOwnDescendants({ path: path, includeBase }, pagination)
      }
      // 他ユーザーが保持するノードを検索しようとしている場合
      else {
        return this.getOtherDescendants({ path, includeBase }, pagination)
      }
    } else {
      return this.getOwnDescendants({ path, includeBase }, pagination)
    }
  }

  protected async getOwnDescendants(
    { path, includeBase }: { path: string; includeBase?: boolean },
    pagination?: StoragePaginationInput
  ): Promise<StoragePaginationResult<NODE>> {
    const maxChunk = pagination?.maxChunk || CoreStorageService.MaxChunk

    const pageToken = decodePageToken(pagination?.pageToken)
    if (!pageToken.pit) {
      pageToken.pit = await openPointInTime(this.client, CoreStorageSchema.IndexAlias)
    }

    let query: any

    // 指定ディレクトリパスがバケットの場合
    if (path === '') {
      // バケット配下を検索 (全ノード検索)
      query = { match_all: {} }
    }
    // 指定ディレクトリパスがバケット配下の場合
    else {
      // 指定ディレクトリを含む場合
      if (includeBase) {
        // 指定パスディレクトリ含め配下のノードを取得
        query = {
          bool: {
            should: [
              {
                bool: {
                  must: [{ term: { path } }, { term: { nodeType: 'Dir' } }],
                },
              },
              { wildcard: { path: `${path}/*` } },
            ],
          },
        }
      }
      // 指定ディレクトリパスを含まない場合
      else {
        // 指定ディレクトリパス配下のノードを取得
        query = { wildcard: { path: `${path}/*` } }
      }
    }

    // データベースからノードを取得
    let response!: ElasticSearchAPIResponse<DB_NODE>
    try {
      response = await this.client.search<ElasticSearchResponse<DB_NODE>>({
        size: maxChunk,
        body: {
          query,
          sort: [{ path: 'asc' }],
          ...pageToken,
        },
        _source_includes: this.includeNodeFields,
        _source_excludes: this.excludeNodeFields,
      })
    } catch (err) {
      if (isPaginationTimeout(err)) {
        return { list: [], isPaginationTimeout: true }
      } else {
        throw err
      }
    }
    const nodes = this.dbResponseToNodes(response)

    // 指定ディレクトリを含む検索の、初回検索だった場合
    if (includeBase && path && !pagination?.pageToken) {
      // 指定ディレクトリパスのノードが存在しない場合
      if (!nodes.some(node => node.path === path)) {
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

  protected async getOtherDescendants(
    { path, includeBase }: { path: string; includeBase?: boolean },
    pagination?: StoragePaginationInput
  ): Promise<StoragePaginationResult<NODE>> {
    throw new AppError(`Not implemented yet.`)
  }

  /**
   * 指定されたディレクトリ配下のノード数を取得します。
   * @param idToken
   * @param input
   */
  getDescendantsCount(idToken: IdToken, input: StorageNodeGetUnderInput): Promise<number>

  /**
   * @see getDescendantsCount
   * @param input
   */
  getDescendantsCount(input: StorageNodeGetUnderInput): Promise<number>

  async getDescendantsCount(arg1: IdToken | StorageNodeGetUnderInput, arg2?: StorageNodeGetUnderInput): Promise<number> {
    const getDescendantsCount_ = async ({ path, includeBase }: { path: string; includeBase?: boolean }) => {
      let query: any

      // 指定ディレクトリパスがバケットの場合
      if (path === '') {
        // バケット配下を検索 (全ノード検索)
        query = { match_all: {} }
      }
      // 指定ディレクトリパスがバケット配下の場合
      else {
        // 指定ディレクトリを含む場合
        if (includeBase) {
          // 指定パスディレクトリ含め配下のノードを取得
          query = {
            bool: {
              should: [
                {
                  bool: {
                    must: [{ term: { path } }, { term: { nodeType: 'Dir' } }],
                  },
                },
                { wildcard: { path: `${path}/*` } },
              ],
            },
          }
        }
        // 指定ディレクトリパスを含まない場合
        else {
          // 指定ディレクトリパス配下のノードを取得
          query = { wildcard: { path: `${path}/*` } }
        }
      }

      // データベースからカウントを取得
      const response = await this.client.count({
        index: CoreStorageSchema.IndexAlias,
        body: { query },
      })

      return response.body.count
    }

    let idToken: IdToken | undefined
    let input: StorageNodeGetUnderInput
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      input = arg2 as StorageNodeGetUnderInput
    } else {
      input = arg1
    }

    let path: string
    const includeBase = input.includeBase

    if (input.id) {
      const node = await this.getNode({ id: input.id })
      if (!node) return 0
      path = node.path
    } else {
      path = input.path!
    }

    if (!input.id && typeof input.path !== 'string') {
      throw new AppError(`Either 'id' or 'path' must be specified.`)
    }

    idToken && (await this.validateBrowsable(idToken, path))

    return getDescendantsCount_({ path, includeBase })
  }

  /**
   * 指定されたディレクトリ直下のノードを取得します。
   * @param idToken
   * @param input
   * @param pagination
   */
  async getChildren(idToken: IdToken, input: StorageNodeGetUnderInput, pagination?: StoragePaginationInput): Promise<StoragePaginationResult<NODE>>

  /**
   * @see getChildren
   * @param input
   * @param pagination
   */
  async getChildren(input: StorageNodeGetUnderInput, pagination?: StoragePaginationInput): Promise<StoragePaginationResult<NODE>>

  async getChildren(
    arg1: IdToken | StorageNodeGetUnderInput,
    arg2?: StorageNodeGetUnderInput | StoragePaginationInput,
    arg3?: StoragePaginationInput
  ): Promise<StoragePaginationResult<NODE>> {
    let idToken: IdToken | undefined
    let input: StorageNodeGetUnderInput
    let pagination: StoragePaginationInput | undefined
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      input = arg2 as StorageNodeGetUnderInput
      pagination = arg3
    } else {
      input = arg1
      pagination = arg2 as StoragePaginationInput | undefined
    }

    let path: string
    const includeBase = input.includeBase

    if (input.id) {
      const node = await this.getNode({ id: input.id })
      if (!node) return { list: [] }
      path = node.path
    } else {
      path = input.path!
    }

    if (!input.id && typeof input.path !== 'string') {
      throw new AppError(`Either 'id' or 'path' must be specified.`)
    }

    if (idToken) {
      await this.validateBrowsable(idToken, path)

      // 自身が保持するノードを検索しようとしている場合
      // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
      if (CoreStorageService.isOwnUserRootUnder(idToken, path) || idToken.isAppAdmin) {
        return this.getOwnChildren({ path, includeBase }, pagination)
      }
      // 他ユーザーが保持するノードを検索しようとしている場合
      else {
        return this.getOtherChildren({ path, includeBase }, pagination)
      }
    } else {
      return this.getOwnChildren({ path, includeBase }, pagination)
    }
  }

  protected async getOwnChildren(
    { path, includeBase }: { path: string; includeBase?: boolean },
    pagination?: StoragePaginationInput
  ): Promise<StoragePaginationResult<NODE>> {
    const maxChunk = pagination?.maxChunk || CoreStorageService.MaxChunk

    const pageToken = decodePageToken(pagination?.pageToken)
    if (!pageToken.pit) {
      pageToken.pit = await openPointInTime(this.client, CoreStorageSchema.IndexAlias)
    }

    let query: any

    // 指定ディレクトリパスがバケットの場合
    if (path === '') {
      // バケット直下を検索
      query = { term: { dir: '' } }
    }
    // 指定ディレクトリパスがバケット配下の場合
    else {
      // 指定パスディレクトリを含む場合
      if (includeBase) {
        // 指定パスディレクトリ含め直下のノードを取得
        query = {
          bool: {
            should: [
              {
                bool: {
                  must: [{ term: { path } }, { term: { nodeType: 'Dir' } }],
                },
              },
              { term: { dir: path } },
            ],
          },
        }
        // 指定ディレクトリパスを含まない場合
      } else {
        // 指定ディレクトリパス直下のノードを取得
        query = { term: { dir: path } }
      }
    }

    // データベースからノードを取得
    let response!: ElasticSearchAPIResponse<DB_NODE>
    try {
      response = await this.client.search<ElasticSearchResponse<DB_NODE>>({
        size: maxChunk,
        body: {
          query,
          sort: [{ path: 'asc' }],
          ...pageToken,
        },
        _source_includes: this.includeNodeFields,
        _source_excludes: this.excludeNodeFields,
      })
    } catch (err) {
      if (isPaginationTimeout(err)) {
        return { list: [], isPaginationTimeout: true }
      } else {
        throw err
      }
    }
    const nodes = this.dbResponseToNodes(response)

    // 指定ディレクトリを含む検索の、初回検索だった場合
    if (includeBase && path && !pagination?.pageToken) {
      // 指定ディレクトリパスのノードが存在しない場合
      if (!nodes.some(node => node.path === path)) {
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

  protected async getOtherChildren(
    { path, includeBase }: { path: string; includeBase?: boolean },
    pagination?: StoragePaginationInput
  ): Promise<StoragePaginationResult<NODE>> {
    throw new AppError(`Not implemented yet.`)
  }

  /**
   * 指定されたディレクトリ直下のノード数を取得します。
   * @param idToken
   * @param input
   */
  getChildrenCount(idToken: IdToken, input: StorageNodeGetUnderInput): Promise<number>

  /**
   * @see getChildrenCount
   * @param input
   */
  getChildrenCount(input: StorageNodeGetUnderInput): Promise<number>

  async getChildrenCount(arg1: IdToken | StorageNodeGetUnderInput, arg2?: StorageNodeGetUnderInput): Promise<number> {
    const getChildrenCount_ = async ({ path, includeBase }: { path: string; includeBase?: boolean }) => {
      let query: any

      // 指定ディレクトリパスがバケットの場合
      if (path === '') {
        // バケット直下を検索
        query = { term: { dir: '' } }
      }
      // 指定ディレクトリパスがバケット配下の場合
      else {
        // 指定パスディレクトリを含む場合
        if (includeBase) {
          // 指定パスディレクトリ含め直下のノードを取得
          query = {
            bool: {
              should: [
                {
                  bool: {
                    must: [{ term: { path } }, { term: { nodeType: 'Dir' } }],
                  },
                },
                { term: { dir: path } },
              ],
            },
          }
        }
        // 指定ディレクトリパスを含まない場合
        else {
          // 指定ディレクトリパス直下のノードを取得
          query = { term: { dir: path } }
        }
      }

      // データベースからカウントを取得
      const response = await this.client.count({
        index: CoreStorageSchema.IndexAlias,
        body: { query },
      })

      return response.body.count
    }

    let idToken: IdToken | undefined
    let input: StorageNodeGetUnderInput
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      input = arg2 as StorageNodeGetUnderInput
    } else {
      input = arg1
    }

    let path: string
    const includeBase = input.includeBase

    if (input.id) {
      const node = await this.getNode({ id: input.id })
      if (!node) return 0
      path = node.path
    } else {
      path = input.path!
    }

    if (!input.id && typeof input.path !== 'string') {
      throw new AppError(`Either 'id' or 'path' must be specified.`)
    }

    idToken && (await this.validateBrowsable(idToken, path))

    return getChildrenCount_({ path, includeBase })
  }

  /**
   * 指定されたノードとノードの階層構造を形成するディレクトリを取得します。
   * @param idToken
   * @param nodePath
   */
  getHierarchicalNodes(idToken: IdToken, nodePath: string): Promise<NODE[]>

  /**
   * @see getHierarchicalNodes
   * @param nodePath
   */
  getHierarchicalNodes(nodePath: string): Promise<NODE[]>

  async getHierarchicalNodes(arg1: IdToken | string, arg2?: string): Promise<NODE[]> {
    let idToken: IdToken | undefined
    let nodePath: string
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      nodePath = arg2!
    } else {
      nodePath = arg1
    }
    nodePath = removeBothEndsSlash(nodePath)

    if (!nodePath) return []

    idToken && (await this.validateBrowsable(idToken, nodePath))

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
      // 欠けているディレクトリがあった場合
      if (ancestorDirNodes.length !== ancestorDirPaths.length) {
        throw new AppError(`The ancestor of the node you are trying to retrieve does not exist.`, {
          nodePath,
          ancestorPaths: ancestorDirNodes.map(node => node.path),
        })
      }
      nodes = [...ancestorDirNodes, node]
    }
    // 引数ノードが存在しない場合
    // ※引数ノードは存在しないので、実際に存在する祖先ディレクトリのみを取得する
    else {
      nodes = await this.getNodes({ paths: ancestorDirPaths })
    }

    return CoreStorageService.sortNodes(nodes) as NODE[]
  }

  /**
   * 指定されたノードの階層構造を形成する祖先ディレクトリを取得します。
   * @param idToken
   * @param nodePath
   */
  getAncestorDirs(idToken: IdToken, nodePath: string): Promise<NODE[]>

  /**
   * @see getAncestorDirs
   * @param nodePath
   */
  getAncestorDirs(nodePath: string): Promise<NODE[]>

  async getAncestorDirs(arg1: IdToken | string, arg2?: string): Promise<NODE[]> {
    let result: NODE[]
    let nodePath: string
    if (AuthHelper.isIdToken(arg1)) {
      nodePath = arg2!
      result = await this.getHierarchicalNodes(arg1, nodePath)
    } else {
      nodePath = arg1
      result = await this.getHierarchicalNodes(nodePath)
    }
    return result.filter(node => node.path !== nodePath)
  }

  /**
   * ディレクトリを作成します。
   * @param idToken
   * @param dirPath
   * @param options
   */
  createDir(idToken: IdToken, dirPath: string, options?: CreateStorageNodeOptions): Promise<NODE>

  /**
   * @see createDir
   * @param dirPath
   * @param options
   */
  createDir(dirPath: string, options?: CreateStorageNodeOptions): Promise<NODE>

  async createDir(arg1: IdToken | string, arg2?: string | CreateStorageNodeOptions, arg3?: CreateStorageNodeOptions): Promise<NODE> {
    let idToken: IdToken | undefined
    let dirPath: string
    let options: CreateStorageNodeOptions | undefined
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      dirPath = arg2 as string
      options = arg3
    } else {
      dirPath = arg1
      options = arg2 as CreateStorageNodeOptions | undefined
    }

    if (idToken) {
      await this.validateBrowsable(idToken, dirPath)

      // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
      if (CoreStorageService.isOwnUserRootUnder(idToken, dirPath) || idToken.isAppAdmin) {
        return this.createOwnDir(dirPath, options)
      } else {
        return this.createOtherDir(dirPath, options)
      }
    } else {
      return this.createOwnDir(dirPath, options)
    }
  }

  /**
   * 自ユーザーのディレクトリを作成します。
   * @param dirPath
   * @param options
   */
  protected async createOwnDir(dirPath: string, options?: CreateStorageNodeOptions): Promise<NODE> {
    // 指定されたパスのバリデーションチェック
    dirPath = removeBothEndsSlash(dirPath)
    CoreStorageService.validateNodePath(dirPath)

    // 共有設定の入力値を検証
    CoreStorageService.validateShareSettingInput(options?.share)

    // 引数ディレクトリの階層構造形成に必要なノードを取得
    const hierarchicalDirNodes = await this.getRequiredHierarchicalDirNodes(dirPath)
    const ancestorDirNodes = hierarchicalDirNodes.filter(node => node.path !== dirPath)
    const hierarchicalDirNodeDict = arrayToDict(hierarchicalDirNodes, 'path')

    for (const ancestorDirNode of ancestorDirNodes) {
      // 祖先ディレクトリが存在することをチェック
      if (!ancestorDirNode.exists) {
        throw new AppError(`The ancestor directory of the specified directory does not exist.`, {
          specifiedPath: dirPath,
          ancestorPath: ancestorDirNode.path,
        })
      }
    }

    const dirNode = hierarchicalDirNodeDict[dirPath]
    // 引数ディレクトリがまだ存在しない場合
    if (!dirNode.exists) {
      // ディレクトリを作成し、データベースに追加
      const id = CoreStorageSchema.generateNodeId()
      const now = dayjs().toISOString()
      await this.client.update({
        index: CoreStorageSchema.IndexAlias,
        id,
        body: {
          doc: {
            ...this.toDBStorageNode(dirNode),
            id,
            share: this.toDBShareSettings(options?.share),
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
      if (options?.share) {
        return await this.setOwnDirShareSettings(dirPath, options.share)
      } else {
        return (await this.getNode({ path: dirPath }))!
      }
    }
  }

  /**
   * 他ユーザーのディレクトリを作成します。
   * @param dirPath
   * @param options
   */
  protected async createOtherDir(dirPath: string, options?: CreateStorageNodeOptions): Promise<NODE> {
    throw new AppError(`Not implemented yet.`)
  }

  /**
   * 指定されたディレクトリの階層構造を形成するのに必要なディレクトリを作成します。
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
   * @param idToken
   * @param dirPaths
   */
  createHierarchicalDirs(idToken: IdToken, dirPaths: string[]): Promise<NODE[]>

  /**
   * @see createHierarchicalDirs
   * @param dirPaths
   */
  createHierarchicalDirs(dirPaths: string[]): Promise<NODE[]>

  async createHierarchicalDirs(arg1: IdToken | string[], arg2?: string[]): Promise<NODE[]> {
    let idToken: IdToken | undefined
    let dirPaths: string[]
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      dirPaths = arg2 as string[]
    } else {
      dirPaths = arg1
    }

    if (idToken) {
      await this.validateBrowsable(idToken, dirPaths)

      const ownDirPaths: string[] = []
      const otherDirPaths: string[] = []
      for (const dirPath of dirPaths) {
        // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
        if (CoreStorageService.isOwnUserRootUnder(idToken, dirPath) || idToken.isAppAdmin) {
          ownDirPaths.push(dirPath)
        } else {
          otherDirPaths.push(dirPath)
        }
      }

      const result: NODE[] = []
      if (ownDirPaths.length) {
        const nodes = await this.createOwnHierarchicalDirs(ownDirPaths)
        result.push(...nodes)
      }
      if (otherDirPaths.length) {
        const nodes = await this.createOtherHierarchicalDirs(otherDirPaths)
        result.push(...nodes)
      }

      return result
    } else {
      return this.createOwnHierarchicalDirs(dirPaths)
    }
  }

  protected async createOwnHierarchicalDirs(dirPaths: string[]): Promise<NODE[]> {
    // 指定されたパスのバリデーションチェック
    dirPaths.forEach(dirPath => CoreStorageService.validateNodePath(dirPath))
    dirPaths = dirPaths.map(dirPath => removeBothEndsSlash(dirPath))

    // 引数ディレクトリの階層構造形成に必要なノードを取得
    const hierarchicalDirNodes = await this.getRequiredHierarchicalDirNodes(...dirPaths)

    // ディレクトリを作成
    const ids: string[] = []
    const body: any[] = []
    for (const dirNode of hierarchicalDirNodes) {
      // ディレクトリが存在する場合はディレクトリを作成しない
      if (dirNode.exists) continue

      const id = CoreStorageSchema.generateNodeId()
      const now = dayjs().toISOString()
      body.push({ index: { _index: CoreStorageSchema.IndexAlias, _id: id } })
      body.push({
        ...this.toDBStorageNode(dirNode),
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
    return CoreStorageService.sortNodes(dirNodes) as NODE[]
  }

  protected async createOtherHierarchicalDirs(dirPaths: string[]): Promise<NODE[]> {
    throw new AppError(`Not implemented yet.`)
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
   * @param idToken
   * @param dirPath
   * @param pagination
   */
  removeDir(idToken: IdToken, dirPath: string, pagination?: { maxChunk?: number }): Promise<void>

  /**
   * @see removeDir
   * @param dirPath
   * @param pagination
   */
  removeDir(dirPath: string, pagination?: { maxChunk?: number }): Promise<void>

  async removeDir(arg1: IdToken | string, arg2?: string | { maxChunk?: number }, arg3?: { maxChunk?: number }): Promise<void> {
    let idToken: IdToken | undefined
    let dirPath: string
    let pagination: { maxChunk?: number } | undefined
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      dirPath = arg2 as string
      pagination = arg3
    } else {
      dirPath = arg1
      pagination = arg2 as { maxChunk?: number } | undefined
    }

    if (idToken) {
      await this.validateBrowsable(idToken, dirPath)

      // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
      if (CoreStorageService.isOwnUserRootUnder(idToken, dirPath) || idToken.isAppAdmin) {
        return this.removeOwnDir(dirPath, pagination)
      } else {
        return this.removeOtherDir(dirPath, pagination)
      }
    } else {
      return this.removeOwnDir(dirPath, pagination)
    }
  }

  /**
   * 自ユーザーのディレクトリを削除します。
   * @param dirPath
   * @param pagination
   */
  protected async removeOwnDir(dirPath: string, pagination?: { maxChunk?: number }): Promise<void> {
    if (!dirPath) {
      throw new AppError(`The argument 'dirPath' is empty.`)
    }

    const bucket = admin.storage().bucket()
    const size = pagination?.maxChunk ?? 1000
    let nodes: { id: string; path: string }[]
    const pageToken: ElasticPageToken = {
      pit: await openPointInTime(this.client, CoreStorageSchema.IndexAlias),
    }

    do {
      // データベースから引数ディレクトリ配下のファイルノードを取得
      const response = await this.client.search<ElasticSearchResponse<{ id: string; path: string }>>({
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
                { term: { nodeType: 'File' } },
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
      index: CoreStorageSchema.IndexAlias,
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
   * 他ユーザーのディレクトリを削除します。
   * @param dirPath
   * @param pagination
   */
  protected async removeOtherDir(dirPath: string, pagination?: { maxChunk?: number }): Promise<void> {
    throw new AppError(`Not implemented yet.`)
  }

  /**
   * ファイルを削除します。
   * @param idToken
   * @param filePath
   */
  removeFile(idToken: IdToken, filePath: string): Promise<FILE_NODE | undefined>

  /**
   * ファイルを削除します。
   * @param filePath
   */
  removeFile(filePath: string): Promise<FILE_NODE | undefined>

  async removeFile(arg1: IdToken | string, arg2?: string): Promise<FILE_NODE | undefined> {
    let idToken: IdToken | undefined
    let filePath: string
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      filePath = arg2 as string
    } else {
      filePath = arg1
    }

    if (idToken) {
      await this.validateBrowsable(idToken, filePath)

      if (CoreStorageService.isOwnUserRootUnder(idToken, filePath) || idToken.isAppAdmin) {
        return this.removeOwnFile(filePath)
      } else {
        return this.removeOtherFile(filePath)
      }
    } else {
      return this.removeOwnFile(filePath)
    }
  }

  protected async removeOwnFile(filePath: string): Promise<FILE_NODE | undefined> {
    if (!filePath) {
      throw new AppError(`The argument 'filePath' is empty.`)
    }

    const fileNode = await this.getFileNode({ path: filePath })
    if (!fileNode) return undefined

    // ストレージからファイルを削除
    await fileNode.file.delete()
    // ストアからファイルを削除
    await this.client.delete({
      index: CoreStorageSchema.IndexAlias,
      id: fileNode.id,
      refresh: true,
    })

    return fileNode
  }

  protected async removeOtherFile(filePath: string): Promise<FILE_NODE | undefined> {
    throw new AppError(`Not implemented yet.`)
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
   * @param idToken
   * @param fromDirPath
   * @param toDirPath
   * @param options
   */
  moveDir(idToken: IdToken, fromDirPath: string, toDirPath: string, options?: { maxChunk?: number }): Promise<void>

  /**
   * @see moveDir
   * @param fromDirPath
   * @param toDirPath
   * @param options
   */
  moveDir(fromDirPath: string, toDirPath: string, options?: { maxChunk?: number }): Promise<void>

  async moveDir(arg1: IdToken | string, arg2: string, arg3?: string | { maxChunk?: number }, arg4?: { maxChunk?: number }): Promise<void> {
    let idToken: IdToken | undefined
    let fromDirPath: string
    let toDirPath: string
    let options: { maxChunk?: number } | undefined
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      fromDirPath = arg2
      toDirPath = arg3 as string
      options = arg4
    } else {
      fromDirPath = arg1
      toDirPath = arg2
      options = arg3 as { maxChunk?: number } | undefined
    }

    if (idToken) {
      await this.validateBrowsable(idToken, [fromDirPath, toDirPath])

      if (CoreStorageService.isOwnUserRootUnder(idToken, fromDirPath) || idToken.isAppAdmin) {
        return this.moveOwnDir(fromDirPath, toDirPath, options)
      } else {
        return this.moveOtherDir(fromDirPath, toDirPath, options)
      }
    } else {
      return this.moveOwnDir(fromDirPath, toDirPath, options)
    }
  }

  protected async moveOwnDir(fromDirPath: string, toDirPath: string, options?: { maxChunk?: number }): Promise<void> {
    fromDirPath = removeBothEndsSlash(fromDirPath)
    toDirPath = removeBothEndsSlash(toDirPath)
    const maxChunk = options?.maxChunk ?? 1000

    CoreStorageService.validateNodePath(toDirPath)

    // 移動元と移動先が同じでないことを確認
    if (fromDirPath === toDirPath) {
      throw new AppError(`The source and destination are the same: '${fromDirPath}' -> '${toDirPath}'`)
    }

    // 移動先ディレクトリが移動元のサブディレクトリでないことを確認
    // from: aaa/bbb → to: aaa/bbb/ccc/bbb [NG]
    //               → to: aaa/zzz/ccc/bbb [OK]
    if (toDirPath.startsWith(_path.join(fromDirPath, '/'))) {
      throw new AppError(`The destination directory is its own subdirectory: '${_path.join(fromDirPath)}' -> '${_path.join(toDirPath)}'`)
    }

    // 移動先の所属ディレクトリの存在確認
    // ※バケット直下への移動時はディレクトリの存在確認はしない
    const toParentPath = removeStartDirChars(_path.dirname(toDirPath))
    if (toParentPath) {
      const toParentNode = await this.getNode({ path: toParentPath })
      if (!toParentNode) {
        throw new AppError(`The destination directory does not exist: '${toParentPath}'`)
      }
    }

    let pagination: StoragePaginationResult<NODE> = { nextPageToken: undefined, list: [] }
    do {
      pagination = await this.getOwnDescendants(
        { path: fromDirPath, includeBase: true },
        {
          maxChunk,
          pageToken: pagination.nextPageToken,
        }
      )

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
            level: CoreStorageSchema.getNodeLevel(toNodePath),
            version: node.version + 1,
          }
          if (toNode.nodeType === 'File') {
            result.toFileNodes.push(toNode)
          }
          result.toNodes.push(toNode)
          return result
        },
        { toNodes: [], toFileNodes: [] } as { toNodes: NODE[]; toFileNodes: NODE[] }
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
        index: CoreStorageSchema.IndexAlias,
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
        index: CoreStorageSchema.IndexAlias,
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
    } while (pagination.nextPageToken)
  }

  protected async moveOtherDir(fromDirPath: string, toDirPath: string, options?: { maxChunk?: number }): Promise<void> {
    throw new AppError(`Not implemented yet.`)
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
   * @param idToken
   * @param fromFilePath
   * @param toFilePath
   */
  moveFile(idToken: IdToken, fromFilePath: string, toFilePath: string): Promise<FILE_NODE>

  /**
   * @see moveFile
   * @param fromFilePath
   * @param toFilePath
   */
  moveFile(fromFilePath: string, toFilePath: string): Promise<FILE_NODE>

  async moveFile(arg1: IdToken | string, arg2: string, arg3?: string): Promise<FILE_NODE> {
    let idToken: IdToken | undefined
    let fromFilePath: string
    let toFilePath: string
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      fromFilePath = arg2
      toFilePath = arg3 as string
    } else {
      fromFilePath = arg1
      toFilePath = arg2
    }

    if (idToken) {
      await this.validateBrowsable(idToken, [fromFilePath, toFilePath])

      // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
      if (CoreStorageService.isOwnUserRootUnder(idToken, fromFilePath) || idToken.isAppAdmin) {
        return this.moveOwnFile(fromFilePath, toFilePath)
      } else {
        return this.moveOtherFile(fromFilePath, toFilePath)
      }
    } else {
      return this.moveOwnFile(fromFilePath, toFilePath)
    }
  }

  protected async moveOwnFile(fromFilePath: string, toFilePath: string): Promise<FILE_NODE> {
    fromFilePath = removeBothEndsSlash(fromFilePath)
    toFilePath = removeBothEndsSlash(toFilePath)

    CoreStorageService.validateNodePath(toFilePath)

    // 移動元ファイルの存在確認
    const fileNode = await this.getFileNode({ path: fromFilePath })
    if (!fileNode) {
      throw new AppError(`The source file does not exist: '${fromFilePath}'`)
    }

    // 移動先の所属ディレクトリの存在確認
    // ※バケット直下への移動時はディレクトリの存在確認はしない
    const toParentPath = removeStartDirChars(_path.dirname(toFilePath))
    if (toParentPath) {
      const toParentNode = await this.getNode({ path: toParentPath })
      if (!toParentNode) {
        throw new AppError(`The destination directory does not exist: '${toParentPath}'`)
      }
    }

    // 移動先に同名のファイルが存在している場合
    const existingToFileNode = await this.getNode({ path: toFilePath })
    if (existingToFileNode) {
      // 移動先の同名ファイルは削除
      // ・データベースからファイルノードを削除
      await this.client.delete({
        index: CoreStorageSchema.IndexAlias,
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
      index: CoreStorageSchema.IndexAlias,
      id: fileNode.id,
      body: {
        doc: {
          ...CoreStorageSchema.toPathData(toFilePath),
          version,
        },
      },
      refresh: true,
    })

    return this.sgetFileNode({ id: fileNode.id })
  }

  protected async moveOtherFile(fromFilePath: string, toFilePath: string): Promise<FILE_NODE> {
    throw new AppError(`Not implemented yet.`)
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
   * @param idToken
   * @param dirPath
   * @param newName
   * @param options
   */
  renameDir(idToken: IdToken, dirPath: string, newName: string, options?: { maxChunk?: number }): Promise<void>

  /**
   * @see renameDir
   * @param dirPath
   * @param newName
   * @param options
   */
  renameDir(dirPath: string, newName: string, options?: { maxChunk?: number }): Promise<void>

  async renameDir(arg1: IdToken | string, arg2: string, arg3?: string | { maxChunk?: number }, arg4?: { maxChunk?: number }): Promise<void> {
    let idToken: IdToken | undefined
    let dirPath: string
    let newName: string
    let options: { maxChunk?: number } | undefined
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      dirPath = arg2
      newName = arg3 as string
      options = arg4
    } else {
      dirPath = arg1
      newName = arg2
      options = arg3 as { maxChunk?: number } | undefined
    }

    if (idToken) {
      await this.validateBrowsable(idToken, dirPath)

      // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
      if (CoreStorageService.isOwnUserRootUnder(idToken, dirPath) || idToken.isAppAdmin) {
        return this.renameOwnDir(dirPath, newName, options)
      } else {
        return this.renameOtherDir(dirPath, newName, options)
      }
    } else {
      return this.renameOwnDir(dirPath, newName, options)
    }
  }

  protected async renameOwnDir(dirPath: string, newName: string, options?: { maxChunk?: number }): Promise<void> {
    dirPath = removeBothEndsSlash(dirPath)

    CoreStorageService.validateNodeName(newName)

    // リネームした際のパスを作成
    const reg = new RegExp(`${_path.basename(dirPath)}$`)
    const toDirPath = dirPath.replace(reg, newName)

    // 既に同じ名前のディレクトリがある場合
    const toDirNode = await this.getNode({ path: toDirPath })
    if (toDirNode) {
      throw new AppError(`The specified directory name already exists: '${dirPath}' -> '${toDirPath}'`)
    }

    return await this.moveOwnDir(dirPath, toDirPath, options)
  }

  protected async renameOtherDir(dirPath: string, newName: string, options?: { maxChunk?: number }): Promise<void> {
    throw new AppError(`Not implemented yet.`)
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
   * @param idToken
   * @param filePath
   * @param newName
   */
  renameFile(idToken: IdToken, filePath: string, newName: string): Promise<FILE_NODE>

  /**
   * @see renameFile
   * @param filePath
   * @param newName
   */
  renameFile(filePath: string, newName: string): Promise<FILE_NODE>

  async renameFile(arg1: IdToken | string, arg2: string, arg3?: string): Promise<FILE_NODE> {
    let idToken: IdToken | undefined
    let filePath: string
    let newName: string
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      filePath = arg2
      newName = arg3 as string
    } else {
      filePath = arg1
      newName = arg2
    }

    if (idToken) {
      await this.validateBrowsable(idToken, filePath)

      // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
      if (CoreStorageService.isOwnUserRootUnder(idToken, filePath) || idToken.isAppAdmin) {
        return this.renameOwnFile(filePath, newName)
      } else {
        return this.renameOtherFile(filePath, newName)
      }
    } else {
      return this.renameOwnFile(filePath, newName)
    }
  }

  protected async renameOwnFile(filePath: string, newName: string): Promise<FILE_NODE> {
    filePath = removeBothEndsSlash(filePath)

    CoreStorageService.validateNodeName(newName)

    // リネームした際のパスを作成
    const reg = new RegExp(`${_path.basename(filePath)}$`)
    const toFilePath = filePath.replace(reg, newName)

    // 既に同じ名前のファイルがある場合
    const toFileNode = await this.getFileNode({ path: toFilePath })
    if (toFileNode) {
      throw new AppError(`The specified file name already exists: '${filePath}' -> '${toFilePath}'`)
    }

    return await this.moveOwnFile(filePath, toFilePath)
  }

  protected async renameOtherFile(filePath: string, newName: string): Promise<FILE_NODE> {
    throw new AppError(`Not implemented yet.`)
  }

  /**
   * ディレクトリに対して共有設定を行います。
   * @param idToken
   * @param dirPath
   * @param input
   */
  setDirShareSettings(idToken: IdToken, dirPath: string, input: StorageNodeShareSettingsInput | null): Promise<NODE>

  /**
   * @see setDirShareSettings
   * @param dirPath
   * @param input
   */
  setDirShareSettings(dirPath: string, input: StorageNodeShareSettingsInput | null): Promise<NODE>

  async setDirShareSettings(
    arg1: IdToken | string,
    arg2: string | StorageNodeShareSettingsInput | null,
    arg3?: StorageNodeShareSettingsInput | null
  ): Promise<NODE> {
    let idToken: IdToken | undefined
    let dirPath: string
    let input: StorageNodeShareSettingsInput | null
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      dirPath = arg2 as string
      input = arg3 as StorageNodeShareSettingsInput | null
    } else {
      dirPath = arg1
      input = arg2 as StorageNodeShareSettingsInput | null
    }

    if (idToken) {
      await this.validateBrowsable(idToken, dirPath)

      // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
      if (CoreStorageService.isOwnUserRootUnder(idToken, dirPath) || idToken.isAppAdmin) {
        return this.setOwnDirShareSettings(dirPath, input)
      } else {
        return this.setOtherDirShareSettings(dirPath, input)
      }
    } else {
      return this.setOwnDirShareSettings(dirPath, input)
    }
  }

  protected async setOwnDirShareSettings(dirPath: string, input: StorageNodeShareSettingsInput | null): Promise<NODE> {
    dirPath = removeBothEndsSlash(dirPath)

    CoreStorageService.validateShareSettingInput(input)

    const dirNode = await this.getNode({ path: dirPath })
    if (!dirNode) {
      throw new AppError(`The specified directory does not exist: '${dirPath}'`)
    }

    const share: StorageNodeShareSettings = this.toDBShareSettings(input, dirNode.share)
    await this.client.update({
      index: CoreStorageSchema.IndexAlias,
      id: dirNode.id,
      body: {
        doc: {
          ...CoreStorageSchema.toPathData(dirPath),
          share,
          version: dirNode.version + 1,
        },
      },
      refresh: true,
    })

    return await this.sgetNode({ id: dirNode.id })
  }

  protected async setOtherDirShareSettings(dirPath: string, input: StorageNodeShareSettingsInput | null): Promise<NODE> {
    throw new AppError(`Not implemented yet.`)
  }

  /**
   * ファイルに対して共有設定を行います。
   * @param idToken
   * @param filePath
   * @param input
   */
  setFileShareSettings(idToken: IdToken, filePath: string, input: StorageNodeShareSettingsInput | null): Promise<FILE_NODE>

  /**
   * @see setFileShareSettings
   * @param filePath
   * @param input
   */
  setFileShareSettings(filePath: string, input: StorageNodeShareSettingsInput | null): Promise<FILE_NODE>

  async setFileShareSettings(
    arg1: IdToken | string,
    arg2: string | StorageNodeShareSettingsInput | null,
    arg3?: StorageNodeShareSettingsInput | null
  ): Promise<FILE_NODE> {
    let idToken: IdToken | undefined
    let filePath: string
    let input: StorageNodeShareSettingsInput | null
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      filePath = arg2 as string
      input = arg3 as StorageNodeShareSettingsInput | null
    } else {
      filePath = arg1
      input = arg2 as StorageNodeShareSettingsInput | null
    }

    if (idToken) {
      await this.validateBrowsable(idToken, filePath)

      // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
      if (CoreStorageService.isOwnUserRootUnder(idToken, filePath) || idToken.isAppAdmin) {
        return this.setOwnFileShareSettings(filePath, input)
      } else {
        return this.setOtherFileShareSettings(filePath, input)
      }
    } else {
      return this.setOwnFileShareSettings(filePath, input)
    }
  }

  protected async setOwnFileShareSettings(filePath: string, input: StorageNodeShareSettingsInput | null): Promise<FILE_NODE> {
    filePath = removeBothEndsSlash(filePath)

    CoreStorageService.validateShareSettingInput(input)

    let fileNode = await this.getFileNode({ path: filePath })
    if (!fileNode) {
      throw new AppError(`The specified file does not exist: '${filePath}'`)
    }

    const share: StorageNodeShareSettings = this.toDBShareSettings(input, fileNode.share)
    await this.client.update({
      index: CoreStorageSchema.IndexAlias,
      id: fileNode.id,
      body: {
        doc: {
          ...CoreStorageSchema.toPathData(filePath),
          share,
          version: fileNode.version + 1,
        },
      },
      refresh: true,
    })
    fileNode = await this.sgetFileNode({ id: fileNode.id })

    return fileNode
  }

  protected async setOtherFileShareSettings(filePath: string, input: StorageNodeShareSettingsInput | null): Promise<FILE_NODE> {
    throw new AppError(`Not implemented yet.`)
  }

  /**
   * ファイルアップロードの後に必要な処理を行います。
   * @param idToken
   * @param input
   */
  handleUploadedFile(idToken: IdToken, input: StorageNodeKeyInput): Promise<FILE_NODE>

  /**
   * @see handleUploadedFile
   * @param input
   */
  handleUploadedFile(input: StorageNodeKeyInput): Promise<FILE_NODE>

  async handleUploadedFile(arg1: IdToken | StorageNodeKeyInput, arg2?: StorageNodeKeyInput): Promise<FILE_NODE> {
    let idToken: IdToken | undefined
    let input: StorageNodeKeyInput
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      input = arg2 as StorageNodeKeyInput
    } else {
      input = arg1
    }

    if (idToken) {
      await this.validateBrowsable(idToken, input.path)

      // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
      if (CoreStorageService.isOwnUserRootUnder(idToken, input.path) || idToken.isAppAdmin) {
        return this.handleOwnUploadedFile(input)
      } else {
        return this.handleOtherUploadedFile(input)
      }
    } else {
      return this.handleOwnUploadedFile(input)
    }
  }

  protected async handleOwnUploadedFile(input: StorageNodeKeyInput): Promise<FILE_NODE> {
    const { id: nodeId, path: nodePath } = input

    // 指定されたパスの検証
    CoreStorageService.validateNodePath(nodePath)

    // ストレージにファイルが存在することを確認
    const { file, exists } = await this.getStorageFile(nodeId)
    if (!exists) {
      throw new AppError(`Uploaded file not found.`, input)
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
        throw new AppError(`The ancestor directory of the file does not exist.`, {
          fileNodePath: nodePath,
          ancestorPath: dirNode.path,
        })
      }
    }

    // データベースのファイルノード作成/更新
    return await this.saveFileNode(nodePath, file)
  }

  protected async handleOtherUploadedFile(input: StorageNodeKeyInput): Promise<FILE_NODE> {
    throw new AppError(`Not implemented yet.`)
  }

  /**
   * 署名付きのアップロードURLを取得します。
   * @param idToken
   * @param requestOrigin
   * @param inputs
   */
  getSignedUploadUrls(idToken: IdToken, requestOrigin: string, inputs: SignedUploadUrlInput[]): Promise<string[]>

  /**
   * @see getSignedUploadUrls
   * @param requestOrigin
   * @param inputs
   */
  getSignedUploadUrls(requestOrigin: string, inputs: SignedUploadUrlInput[]): Promise<string[]>

  async getSignedUploadUrls(arg1: IdToken | string, arg2: string | SignedUploadUrlInput[], arg3?: SignedUploadUrlInput[]): Promise<string[]> {
    let idToken: IdToken | undefined
    let requestOrigin: string
    let inputs: SignedUploadUrlInput[]
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      requestOrigin = arg2 as string
      inputs = arg3 as SignedUploadUrlInput[]
    } else {
      requestOrigin = arg1
      inputs = arg2 as SignedUploadUrlInput[]
    }

    if (idToken) {
      await this.validateBrowsable(
        idToken,
        inputs.map(input => input.path)
      )

      const ownInputs: SignedUploadUrlInput[] = []
      const otherInputs: SignedUploadUrlInput[] = []
      for (const input of inputs) {
        // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
        if (CoreStorageService.isOwnUserRootUnder(idToken, input.path) || idToken.isAppAdmin) {
          ownInputs.push(input)
        } else {
          otherInputs.push(input)
        }
      }

      const result: string[] = []
      if (ownInputs.length) {
        const nodes = await this.getOwnSignedUploadUrls(requestOrigin, inputs)
        result.push(...nodes)
      }
      if (otherInputs.length) {
        const nodes = await this.getOtherSignedUploadUrls(requestOrigin, inputs)
        result.push(...nodes)
      }

      return result
    } else {
      return this.getOwnSignedUploadUrls(requestOrigin, inputs)
    }
  }

  protected async getOwnSignedUploadUrls(requestOrigin: string, inputs: SignedUploadUrlInput[]): Promise<string[]> {
    const bucket = admin.storage().bucket()
    const urlDict: { [id: string]: string } = {}

    for (const input of inputs) {
      const { id: nodeId, path: nodePath, contentType } = input

      // ファイルノードを取得
      const fileNode = await this.getNode({ id: nodeId })

      // アップロードURLを発行
      const gcsFileNode = bucket.file(nodeId)
      const [url] = await gcsFileNode.createResumableUpload({
        origin: requestOrigin,
        metadata: {
          contentType,
        },
      })
      urlDict[nodeId] = url
    }

    return inputs.map(input => urlDict[input.id])
  }

  protected async getOtherSignedUploadUrls(requestOrigin: string, inputs: SignedUploadUrlInput[]): Promise<string[]> {
    throw new AppError(`Not implemented yet.`)
  }

  /**
   * Cloud Storageのセキュリティルールを通過させるため、
   * ユーザークレイムにファイルアクセス権限を設定します。
   * @param user
   * @param input
   */
  async setFileAccessAuthClaims(user: UserIdClaims, input: StorageNodeKeyInput): Promise<string> {
    // ファイルの共有設定を取得
    const hierarchicalNodes = await this.getHierarchicalNodes(input.path)
    const share = this.getInheritedShareSettings(hierarchicalNodes)

    //
    // 読み込み権限
    //
    let readableNodeId: string | undefined
    // アプリケーションファイルの場合
    if (CoreStorageService.isAppNode(input.path)) {
      // 「自ユーザーがアプリケーション管理者」or「ファイルが公開」or「ファイルの読み込み権限に自ユーザーが含まれている」の場合、読み込み可能
      if (user.isAppAdmin || share.isPublic || share.readUIds?.includes(user.uid)) {
        readableNodeId = input.id
      }
    }
    // ユーザーファイルの場合
    else {
      // 「ファイルが自ユーザの所有物」or「ファイルが公開」or「ファイルの読み込み権限に自ユーザーが含まれている」の場合、読み込み可能
      if (CoreStorageService.isOwnUserRootUnder(user, input.path) || share.isPublic || share.readUIds?.includes(user.uid)) {
        readableNodeId = input.id
      }
    }

    //
    // 書き込み権限
    //
    let writableNodeId: string | undefined
    // アプリケーションファイルの場合
    if (CoreStorageService.isAppNode(input.path)) {
      // 「自ユーザーがアプリケーション管理者」or「ファイルの書き込み権限に自ユーザーが含まれている」の場合、書き込み可能
      if (user.isAppAdmin || share.writeUIds?.includes(user.uid)) {
        writableNodeId = input.id
      }
    }
    // ユーザーファイルの場合
    else {
      // 「ファイルが自ユーザの所有物」or「ファイルの書き込み権限に自ユーザーが含まれている」の場合、読み込み可能
      if (CoreStorageService.isOwnUserRootUnder(user, input.path) || share.writeUIds?.includes(user.uid)) {
        writableNodeId = input.id
      }
    }

    // ユーザークレイムに指定ノードのアクセス権限を設定
    await admin.auth().setCustomUserClaims(user.uid, {
      ...UserHelper.pickUserClaims(user),
      readableNodeId,
      writableNodeId,
    })

    // カスタムトークンの取得
    return await admin.auth().createCustomToken(user.uid, {})
  }

  /**
   * Cloud Storageのセキュリティルールを通過させるために
   * ユーザークレイムに設定されていたファイルアクセス権限を削除します。
   * @param user
   */
  async removeFileAccessAuthClaims(user: UserIdClaims): Promise<string> {
    // ユーザークレイムからアクセス権限を削除
    const userClaims = UserHelper.pickUserClaims(user)
    delete userClaims?.readableNodeId
    delete userClaims?.writableNodeId
    await admin.auth().setCustomUserClaims(user.uid, userClaims)

    // カスタムトークンの取得
    return await admin.auth().createCustomToken(user.uid, {})
  }

  //--------------------------------------------------
  //  Utilities
  //--------------------------------------------------

  /**
   * 指定されたユーザーのディレクトリを削除します。
   * このメソッドはユーザーの削除時に使用されることを想定しています。
   * @param uid
   * @param maxChunk
   */
  async deleteUserDir(uid: string, maxChunk = CoreStorageService.MaxChunk): Promise<void> {
    const userRootPath = CoreStorageService.toUserRootPath({ uid })
    await this.removeOwnDir(userRootPath)
  }

  /**
   * リクエスターが自身のノード情報を閲覧しようとしているか検証します。
   * @param idToken
   * @param nodePath
   */
  async validateBrowsable(idToken: IdToken, nodePath: string | undefined): Promise<void>

  /**
   * @see validateBrowsable
   * @param idToken
   * @param nodePaths
   */
  async validateBrowsable(idToken: IdToken, nodePaths: string[]): Promise<void>

  async validateBrowsable(idToken: IdToken, nodePath_or_nodePaths: string | undefined | string[]): Promise<void> {
    /**
     * 指定されたノードとノードの階層構造を形成するディレクトリを取得する関数です。
     * @param nodeMap
     * @param nodePath
     */
    const extractHierarchicalNodes = (nodeMap: Record<string, NODE>, nodePath: string) => {
      const hierarchicalPaths = splitHierarchicalPaths(nodePath)
      return hierarchicalPaths.reduce<NODE[]>((result, path) => {
        const node = nodeMap[path]
        node && result.push(node)
        return result
      }, [])
    }

    if (!idToken) {
      throw new UnauthorizedException('Authentication failed because no ID token was specified in the argument.')
    }

    let nodePaths: string[] = []
    if (Array.isArray(nodePath_or_nodePaths)) {
      nodePaths.push(...nodePath_or_nodePaths)
    } else {
      if (typeof nodePath_or_nodePaths !== 'string') return
      nodePaths.push(nodePath_or_nodePaths)
    }
    nodePaths = nodePaths.map(nodePath => {
      nodePath = removeBothEndsSlash(nodePath)
      CoreStorageService.validateNodePath(nodePath)
      return nodePath
    })
    nodePaths = summarizeFamilyPaths(nodePaths)

    let nodeMap: { [path: string]: NODE }

    // アプリケーションノードパスを含んでいるか取得
    const hasAppNodePath = nodePaths.some(nodePath => CoreStorageService.isAppNode(nodePath))

    // 他ユーザーのノードパスを含んでいるか取得
    const hasOtherNodePath = nodePaths.some(nodePath => CoreStorageService.isOtherUserRootUnder(idToken, nodePath))

    // ユーザーがアプリケーション管理者でなく、
    // かつアプリケーションノードまたは他ユーザーノードのパスを含んでいる場合
    if (!idToken.isAppAdmin && (hasAppNodePath || hasOtherNodePath)) {
      const hierarchicalPaths = splitHierarchicalPaths(...nodePaths)
      const nodes = await this.getNodes({ paths: hierarchicalPaths })
      nodeMap = arrayToDict(nodes, 'path')
    }

    for (const nodePath of nodePaths) {
      if (idToken.isAppAdmin) continue
      // ノードパスがアプリケーションノードまたは他ユーザーノードの場合
      if (CoreStorageService.isAppNode(nodePath) || CoreStorageService.isOtherUserRootFamily(idToken, nodePath)) {
        const hierarchicalNodes = extractHierarchicalNodes(nodeMap!, nodePath)
        const share = this.getInheritedShareSettings(hierarchicalNodes)
        if (!share.readUIds?.includes(idToken.uid)) {
          throw new ForbiddenException(`The user cannot access to the node: ${JSON.stringify({ uid: idToken.uid, nodePath })}`)
        }
      }
    }
  }

  /**
   * クライアントから指定されたファイルをサーブします。
   * @param req
   * @param res
   * @param input
   */
  async serveFile(req: Request, res: Response, input: StorageNodeGetKeyInput): Promise<Response> {
    // 引数のファイルノードを取得
    const fileNode = await this.getFileNode(input)
    if (!fileNode) {
      return res.sendStatus(404)
    }

    // ファイルの共有設定を取得
    const hierarchicalNodes = await this.getHierarchicalNodes(fileNode.path)
    const share = this.getInheritedShareSettings(hierarchicalNodes)

    // ファイルの公開フラグがオンの場合
    if (share.isPublic) {
      return this.streamFile(req, res, fileNode)
    }

    // ユーザー認証されているか検証
    const validated = await this.authService.validate(req, res)
    if (!validated.result) {
      return res.sendStatus(validated.error!.getStatus())
    }
    const user = validated.idToken!

    // アプリケーションファイルの場合
    if (CoreStorageService.isAppNode(fileNode.path)) {
      // 「自ユーザーがアプリケーション管理者」or「ファイルの読み込み権限に自ユーザーが含まれている」の場合、読み込み可能
      if (user.isAppAdmin || share.readUIds?.includes(user.uid)) {
        return this.streamFile(req, res, fileNode)
      }
    }
    // ユーザーファイルの場合
    else {
      // 「ファイルが自ユーザの所有物」or「ファイルが公開」or「ファイルの読み込み権限に自ユーザーが含まれている」の場合、読み込み可能
      if (CoreStorageService.isOwnUserRootUnder(user, fileNode.path) || share.isPublic || share.readUIds?.includes(user.uid)) {
        return this.streamFile(req, res, fileNode)
      }
    }

    return res.sendStatus(403)
  }

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
        throw new AppError(`The directory '${dirNode.path}' to upload to does not exist.`)
      }
    }

    const uploadedFileDict: { [path: string]: FILE_NODE } = {}
    for (const chunk of splitArrayChunk(uploadList, CoreStorageService.MaxChunk)) {
      await Promise.all(
        chunk.map(async uploadItem => {
          const fileNode = await this.saveGCSFileAndFileNode(
            uploadItem.path,
            uploadItem.data,
            { contentType: uploadItem.contentType },
            { share: uploadItem.share }
          )
          uploadedFileDict[fileNode.path] = fileNode
        })
      )
    }

    return uploadList.reduce<FILE_NODE[]>((result, item) => {
      result.push(uploadedFileDict[item.path])
      return result
    }, [])
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
        throw new AppError(`The directory '${dirNode.path}' to upload to does not exist.`)
      }
    }

    const uploadedFileDict: { [path: string]: FILE_NODE } = {}
    const bucket = admin.storage().bucket()
    for (const chunk of splitArrayChunk(uploadList, CoreStorageService.MaxChunk)) {
      await Promise.all(
        chunk.map(async uploadItem => {
          const { localFilePath, fileNodePath } = uploadItem
          const nodeId = CoreStorageSchema.generateNodeId()
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
    return CoreStorageService.sortNodes(hierarchicalNodes) as (NODE & { exists: boolean })[]
  }

  /**
   * 指定されたノードをもとに、上位ディレクトリを加味した共有設定を取得します。
   * @param hierarchicalNodes
   *   階層構造が形成されたノードリストを指定。最後尾のノードの共有設定が取得されます。
   */
  protected getInheritedShareSettings(hierarchicalNodes: NODE[]): Required<StorageNodeShareSettings> {
    hierarchicalNodes = CoreStorageService.sortNodes([...hierarchicalNodes]) as NODE[]

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
   * ストレージファイルをもとに、データベースのファイルノードを保存します。
   * 冪等保存（何度実行しても同じ内容で保存が行われる）したい場合は、
   * `options.idempotent`に`true`を設定してください。
   * @param fileNodePath
   * @param file
   * @param options
   */
  async saveFileNode(
    fileNodePath: string,
    file: File,
    options?: {
      share?: StorageNodeShareSettingsInput
      idempotent?: boolean
    }
  ): Promise<FILE_NODE> {
    fileNodePath = removeBothEndsSlash(fileNodePath)

    const nodeId = file.name
    const existingFileNode = await this.getNode({ id: nodeId })

    // データベースにファイルノードを作成/更新
    const version = typeof existingFileNode?.version === 'number' ? existingFileNode.version + 1 : 1
    const now = dayjs().toISOString()
    await this.client.update({
      index: CoreStorageSchema.IndexAlias,
      id: nodeId,
      body: {
        doc: {
          ...this.toBaseDBStorageNode(
            {
              id: nodeId,
              path: fileNodePath,
              nodeType: 'File',
              share: options?.share,
            },
            existingFileNode
          ),
          contentType: file.metadata.contentType ?? '',
          size: file.metadata.size ? Number(file.metadata.size) : 0,
          ...(() => {
            return !options?.idempotent ? { updatedAt: now, version } : {}
          })(),
        },
        doc_as_upsert: true,
      },
      refresh: true,
    })

    return {
      ...(await this.sgetNode({ id: nodeId })),
      file,
    } as FILE_NODE
  }

  /**
   * ストレージファイルとデータベースへファイルノードを保存します。
   * 冪等保存（何度実行しても同じ内容で保存が行われる）したい場合は、
   * `options.idempotent`に`true`を設定してください。
   * @param fileNodePath
   * @param data
   * @param saveOptions
   * @param options
   */
  protected async saveGCSFileAndFileNode(
    fileNodePath: string,
    data: any,
    saveOptions?: SaveOptions,
    options?: {
      idempotent?: boolean
      share?: StorageNodeShareSettingsInput
    }
  ): Promise<FILE_NODE> {
    fileNodePath = removeBothEndsSlash(fileNodePath)
    const existingFileNode = await this.getNode({ path: fileNodePath })
    const nodeId = existingFileNode?.id || CoreStorageSchema.generateNodeId()

    //
    // ストレージファイルのコンテンツデータを保存
    //
    const bucket = admin.storage().bucket()
    const file = bucket.file(nodeId)
    await file.save(data, saveOptions)

    //
    // ストアにノードデータを保存
    //
    const version = typeof existingFileNode?.version === 'number' ? existingFileNode.version + 1 : 1
    const now = dayjs().toISOString()
    await this.client.update({
      index: CoreStorageSchema.IndexAlias,
      id: nodeId,
      body: {
        doc: {
          ...this.toBaseDBStorageNode(
            {
              id: nodeId,
              path: fileNodePath,
              nodeType: 'File',
              share: options?.share,
            },
            existingFileNode
          ),
          contentType: saveOptions?.contentType ?? existingFileNode?.contentType ?? '',
          size: file.metadata.size ? Number(file.metadata.size) : 0,
          ...(() => {
            return !options?.idempotent ? { updatedAt: now, version } : {}
          })(),
        },
        doc_as_upsert: true,
      },
      refresh: true,
    })

    // 保存されたノードデータを戻り値として返す
    return {
      ...(await this.sgetNode({ id: nodeId })),
      file,
    } as FILE_NODE
  }

  /**
   * データベースのレスポンスデータからノードリストを取得します。
   * @param dbResponse
   */
  protected dbResponseToNodes(dbResponse: ElasticSearchAPIResponse<DB_NODE> | ElasticMSearchAPIResponse<DB_NODE>): NODE[] {
    return CoreStorageSchema.dbResponseToAppEntities(dbResponse) as NODE[]
  }

  /**
   * データベースから取得したノードの形式をアプリケーションで扱われる形式へ変換します。
   * @param dbNode
   * @protected
   */
  protected toStorageNode(dbNode: DB_NODE): NODE {
    return CoreStorageSchema.toAppEntity(dbNode) as NODE
  }

  /**
   * ノードをデータベースへ保存するプロパティのみに絞り込みます。
   * @param node
   */
  protected toDBStorageNode(node: NODE): DB_NODE {
    return CoreStorageSchema.toDBEntity(node) as DB_NODE
  }

  /**
   * 指定された`dirPath`を`CoreStorageNode`へ変換します。
   * @param dirPath
   */
  protected dirPathToStorageNode(dirPath: string): NODE {
    dirPath = removeBothEndsSlash(dirPath)

    return {
      id: '',
      nodeType: 'Dir',
      ...CoreStorageSchema.toPathData(dirPath),
      level: CoreStorageSchema.getNodeLevel(dirPath),
      contentType: '',
      size: 0,
      share: { isPublic: null, readUIds: null, writeUIds: null },
      version: 0,
      createdAt: dayjs(0),
      updatedAt: dayjs(0),
    } as NODE
  }

  /**
   * データベースノード保存時の基本項目が設定されたオブジェクトを取得します。
   * @param input
   * @param existing
   */
  protected toBaseDBStorageNode(
    input: { id: string; nodeType: StorageNodeType; path: string; share?: StorageNodeShareSettingsInput | null },
    existing?: NODE
  ): DB_NODE {
    const now = dayjs()
    return toElasticTimestamp({
      ...CoreStorageSchema.toPathData(input.path),
      id: input.id,
      nodeType: input.nodeType,
      contentType: existing?.contentType ?? '',
      size: existing?.size ?? 0,
      share: this.toDBShareSettings(input.share, existing?.share),
      version: existing?.version ?? 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: existing?.updatedAt ?? now,
    }) as DB_NODE
  }

  /**
   * 共有設定の入力値をデータベースの格納形式に変換します。
   * @param input
   * @param existing
   */
  protected toDBShareSettings(input?: StorageNodeShareSettingsInput | null, existing?: StorageNodeShareSettings): StorageNodeShareSettings {
    let share!: StorageNodeShareSettings

    if (input === null) {
      share = CoreStorageSchema.EmptyShareSettings()
    } else {
      share = { ...CoreStorageSchema.EmptyShareSettings(), ...existing }

      if (typeof input?.isPublic !== 'undefined') {
        share.isPublic = input.isPublic
      }

      if (typeof input?.readUIds !== 'undefined') {
        if (input.readUIds?.length) {
          share.readUIds = input.readUIds
        } else {
          share.readUIds = null
        }
      }

      if (typeof input?.writeUIds !== 'undefined') {
        if (input.writeUIds?.length) {
          share.writeUIds = input.writeUIds
        } else {
          share.writeUIds = null
        }
      }
    }

    return share
  }

  //----------------------------------------------------------------------
  //
  //  Static
  //
  //----------------------------------------------------------------------

  static readonly MaxChunk = 50

  /**
   * ノードパスの検証を行います。
   * @param nodePath
   */
  static validateNodePath(nodePath?: string): void {
    if (typeof nodePath !== 'string') {
      throw new AppError('The specified path is empty.')
    }

    // 改行、タブが含まれないことを検証
    if (/\r?\n|\t/g.test(nodePath)) {
      throw new AppError('The specified path is invalid.', {
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
      throw new AppError('The specified node name is empty.')
    }

    // 改行、タブが含まれないことを検証
    if (/\r?\n|\t/g.test(nodeName)) {
      throw new AppError('The specified node name is invalid.', {
        nodeName,
      })
    }

    // '/'が含まれないことを検証
    if (/\//g.test(nodeName!)) {
      throw new AppError('The specified directory name is invalid.', { nodeName })
    }
  }

  /**
   * 共有設定の入力値を検証します。
   * @param input
   */
  static validateShareSettingInput(input?: StorageNodeShareSettingsInput | null): void {
    input?.readUIds?.forEach(uid => {
      if (!validateUID(uid)) {
        throw new AppError(`The specified 'readUIds' had an incorrect value: '${uid}'`)
      }
    })

    input?.writeUIds?.forEach(uid => {
      if (!validateUID(uid)) {
        throw new AppError(`The specified 'writeUIds' had an incorrect value: '${uid}'`)
      }
    })
  }

  /**
   * ノード配列をディレクトリ階層に従ってソートします。
   * @param nodes
   */
  static sortNodes(nodes: CoreStorageNode[]): CoreStorageNode[] {
    nodes.sort((a, b) => {
      // ソート用文字列(strA, strB)の説明:
      //   ノードがファイルの場合、同じ階層にあるディレクトリより順位を下げるために
      //   大きな文字コード'0xffff'を付加している。これにより同一階層のファイルと
      //   ディレクトリを比較した際、ファイルの方が文字的に大きいと判断され、下の方へ
      //   配置されることになる。

      let strA = a.path
      let strB = b.path
      if (a.nodeType === 'File') {
        strA = `${a.dir}${String.fromCodePoint(0xffff)}${a.name}`
      }
      if (b.nodeType === 'File') {
        strB = `${b.dir}${String.fromCodePoint(0xffff)}${b.name}`
      }

      return strA < strB ? -1 : strA > strB ? 1 : 0
    })
    return nodes
  }

  /**
   * 指定されたパスがアプリケーションノードか否かを取得します。
   * @param nodePath
   */
  static isAppNode(nodePath: string): boolean {
    // ユーザーノード以外はアプリケーションノードと判定
    return !this.isUserRootFamily(nodePath)
  }

  /**
   * 指定されたパスがユーザールートを含めたファミリーノードか否かを取得します。
   * @param nodePath
   */
  static isUserRootFamily(nodePath: string): boolean {
    const reg = new RegExp(`^${config.storage.user.rootName}/[^/]+`)
    return reg.test(nodePath)
  }

  /**
   * 指定されたパスがユーザールート配下のノードか否かを取得します。
   * @param nodePath
   */
  static isUserRootUnder(nodePath: string): boolean {
    const reg = new RegExp(`^${config.storage.user.rootName}/[^/]+/`)
    return reg.test(nodePath)
  }

  /**
   * 指定されたパスがユーザールートを含めたファミリーノードか否かを取得します。
   * @param user
   * @param nodePath
   */
  static isOwnUserRootFamily(user: { uid: string }, nodePath: string): boolean {
    const userRootPath = this.toUserRootPath(user)
    const reg = new RegExp(`^${userRootPath}$|^${userRootPath}/`)
    return reg.test(nodePath)
  }

  /**
   * 指定されたパスがユーザールート配下のノードか否かを取得します。
   * @param user
   * @param nodePath
   */
  static isOwnUserRootUnder(user: { uid: string }, nodePath: string): boolean {
    const userRootPath = this.toUserRootPath(user)
    const reg = new RegExp(`^${userRootPath}/`)
    return reg.test(nodePath)
  }

  /**
   * 指定されたパスが他ユーザールートを含めたファミリーノードか否かを取得します。
   * @param user
   * @param nodePath
   */
  static isOtherUserRootFamily(user: { uid: string }, nodePath: string): boolean {
    if (this.isUserRootFamily(nodePath)) {
      return !this.isOwnUserRootFamily(user, nodePath)
    }
    return false
  }

  /**
   * 指定されたパスが他ユーザールート配下のノードか否かを取得します。
   * @param user
   * @param nodePath
   */
  static isOtherUserRootUnder(user: { uid: string }, nodePath: string): boolean {
    if (this.isUserRootFamily(nodePath)) {
      return !this.isOwnUserRootUnder(user, nodePath)
    }
    return false
  }

  /**
   * 指定されたユーザーのルートディレクトリを取得します。
   * @param user
   */
  static toUserRootPath(user: { uid: string }): string {
    return _path.join(config.storage.user.rootName, user.uid)
  }

  /**
   * 指定されたノードパスからユーザー名を取り出します。
   * @param nodePath
   */
  static extractUId(nodePath: string): string {
    const reg = new RegExp(`^${config.storage.user.rootName}/(?<uid>[^/]+)`)
    const execArray = reg.exec(nodePath)
    return execArray?.groups?.uid ?? ''
  }
}

namespace CoreStorageServiceDI {
  export const symbol = Symbol(CoreStorageService.name)
  export const provider = {
    provide: symbol,
    useClass: CoreStorageService,
  }
  export type type = CoreStorageService
}

@Module({
  providers: [CoreStorageServiceDI.provider],
  exports: [CoreStorageServiceDI.provider],
  imports: [AuthServiceModule],
})
class CoreStorageServiceModule {}

//----------------------------------------------------------------------
//
//  Methods
//
//----------------------------------------------------------------------

export { CoreStorageService, CoreStorageServiceDI, CoreStorageServiceModule }
export { StorageFileNode, StorageUploadDataItem }
