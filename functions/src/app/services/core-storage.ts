import * as _path from 'path'
import * as admin from 'firebase-admin'
import { AppError, validateUID } from '../base'
import { AuthServiceDI, AuthServiceModule } from './base-services/auth'
import {
  CoreStorageNode,
  CreateStorageNodeOptions,
  IdToken,
  PaginationInput,
  PaginationResult,
  SetShareDetailInput,
  SignedUploadUrlInput,
  StorageNodeGetKeyInput,
  StorageNodeGetKeysInput,
  StorageNodeGetUnderInput,
  StorageNodeKeyInput,
  StorageNodeShareDetail,
  UserIdClaims,
} from './base'
import { CoreStorageSchema, UserHelper } from './base'
import {
  DeepPartial,
  arrayToDict,
  removeBothEndsSlash,
  removeStartDirChars,
  splitArrayChunk,
  splitHierarchicalPaths,
  summarizeFamilyPaths,
} from 'web-base-lib'
import {
  ElasticMSearchAPIResponse,
  ElasticPageToken,
  ElasticSearchAPIResponse,
  ElasticSearchResponse,
  closePointInTime,
  decodePageToken,
  encodePageToken,
  isPaginationTimeout,
  newElasticClient,
  openPointInTime,
  retrieveSearchAfter,
  validateBulkResponse,
} from '../base/elastic'
import { File, SaveOptions } from '@google-cloud/storage'
import { ForbiddenException, Inject, Module, UnauthorizedException } from '@nestjs/common'
import { Request, Response } from 'express'
import { AuthHelper } from './base/auth'
import { HttpException } from '@nestjs/common/exceptions/http.exception'
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
  share?: SetShareDetailInput
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
      throw new AppError(`There is no node in the specified key.`, input)
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
  async getDescendants(idToken: IdToken, input: StorageNodeGetUnderInput, pagination?: PaginationInput): Promise<PaginationResult<NODE>>

  /**
   * @see getDescendants
   * @param input
   * @param pagination
   */
  async getDescendants(input: StorageNodeGetUnderInput, pagination?: PaginationInput): Promise<PaginationResult<NODE>>

  async getDescendants(
    arg1: IdToken | StorageNodeGetUnderInput,
    arg2?: StorageNodeGetUnderInput | PaginationInput,
    arg3?: PaginationInput
  ): Promise<PaginationResult<NODE>> {
    let idToken: IdToken | undefined
    let input: StorageNodeGetUnderInput
    let pagination: PaginationInput | undefined
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      input = arg2 as StorageNodeGetUnderInput
      pagination = arg3
    } else {
      input = arg1
      pagination = arg2 as PaginationInput | undefined
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
    { path, includeBase }: Omit<StorageNodeGetUnderInput, 'id'>,
    pagination?: PaginationInput
  ): Promise<PaginationResult<NODE>> {
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
    const searchAfter = retrieveSearchAfter(response)
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
    pagination?: PaginationInput
  ): Promise<PaginationResult<NODE>> {
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
  async getChildren(idToken: IdToken, input: StorageNodeGetUnderInput, pagination?: PaginationInput): Promise<PaginationResult<NODE>>

  /**
   * @see getChildren
   * @param input
   * @param pagination
   */
  async getChildren(input: StorageNodeGetUnderInput, pagination?: PaginationInput): Promise<PaginationResult<NODE>>

  async getChildren(
    arg1: IdToken | StorageNodeGetUnderInput,
    arg2?: StorageNodeGetUnderInput | PaginationInput,
    arg3?: PaginationInput
  ): Promise<PaginationResult<NODE>> {
    let idToken: IdToken | undefined
    let input: StorageNodeGetUnderInput
    let pagination: PaginationInput | undefined
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      input = arg2 as StorageNodeGetUnderInput
      pagination = arg3
    } else {
      input = arg1
      pagination = arg2 as PaginationInput | undefined
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
    { path, includeBase }: Omit<StorageNodeGetUnderInput, 'id'>,
    pagination?: PaginationInput
  ): Promise<PaginationResult<NODE>> {
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
    const searchAfter = retrieveSearchAfter(response)
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
    pagination?: PaginationInput
  ): Promise<PaginationResult<NODE>> {
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
    CoreStorageService.validateShareDetailInput(options?.share)

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
      const id = CoreStorageSchema.generateId()
      const now = dayjs().toISOString()
      await this.client.update({
        index: CoreStorageSchema.IndexAlias,
        id,
        body: {
          doc: {
            ...this.toDBStorageNode(dirNode),
            id,
            share: this.toDBShareDetail(options?.share),
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
        return await this.setDirShareDetail({ path: dirPath }, options.share)
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

      const id = CoreStorageSchema.generateId()
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
   * @param key
   * @param pagination
   */
  removeDir(idToken: IdToken, key: StorageNodeGetKeyInput, pagination?: { maxChunk?: number }): Promise<void>

  /**
   * @see removeDir
   * @param key
   * @param pagination
   */
  removeDir(key: StorageNodeGetKeyInput, pagination?: { maxChunk?: number }): Promise<void>

  async removeDir(
    arg1: IdToken | StorageNodeGetKeyInput,
    arg2?: StorageNodeGetKeyInput | { maxChunk?: number },
    arg3?: { maxChunk?: number }
  ): Promise<void> {
    let idToken: IdToken | undefined
    let key: StorageNodeGetKeyInput
    let pagination: { maxChunk?: number } | undefined
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      key = arg2 as StorageNodeGetKeyInput
      pagination = arg3
    } else {
      key = arg1
      pagination = arg2 as { maxChunk?: number } | undefined
    }

    const dirNode = await this.getNode(key)
    if (!dirNode) return

    if (idToken) {
      await this.validateBrowsable(idToken, dirNode.path)

      // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
      if (CoreStorageService.isOwnUserRootUnder(idToken, dirNode.path) || idToken.isAppAdmin) {
        return this.removeOwnDir(dirNode, pagination)
      } else {
        return this.removeOtherDir(dirNode, pagination)
      }
    } else {
      return this.removeOwnDir(dirNode, pagination)
    }
  }

  /**
   * 自ユーザーのディレクトリを削除します。
   * @param dirNode
   * @param pagination
   */
  protected async removeOwnDir(dirNode: NODE, pagination?: { maxChunk?: number }): Promise<void> {
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
                    should: [{ term: { path: dirNode.path } }, { wildcard: { path: `${dirNode.path}/*` } }],
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
        const searchAfter = retrieveSearchAfter(response)!
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
            should: [{ term: { path: dirNode.path } }, { wildcard: { path: `${dirNode.path}/*` } }],
          },
        },
      },
      refresh: true,
    })
  }

  /**
   * 他ユーザーのディレクトリを削除します。
   * @param dirNode
   * @param pagination
   */
  protected async removeOtherDir(dirNode: NODE, pagination?: { maxChunk?: number }): Promise<void> {
    throw new AppError(`Not implemented yet.`)
  }

  /**
   * ファイルを削除します。
   * @param idToken
   * @param key
   */
  removeFile(idToken: IdToken, key: StorageNodeGetKeyInput): Promise<FILE_NODE | undefined>

  /**
   * ファイルを削除します。
   * @param key
   */
  removeFile(key: StorageNodeGetKeyInput): Promise<FILE_NODE | undefined>

  async removeFile(arg1: IdToken | StorageNodeGetKeyInput, arg2?: StorageNodeGetKeyInput): Promise<FILE_NODE | undefined> {
    let idToken: IdToken | undefined
    let key: StorageNodeGetKeyInput
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      key = arg2 as StorageNodeGetKeyInput
    } else {
      key = arg1
    }

    const fileNode = await this.getFileNode(key)
    if (!fileNode) return

    if (idToken) {
      await this.validateBrowsable(idToken, fileNode.path)

      if (CoreStorageService.isOwnUserRootUnder(idToken, fileNode.path) || idToken.isAppAdmin) {
        return this.removeOwnFile(fileNode)
      } else {
        return this.removeOtherFile(fileNode)
      }
    } else {
      return this.removeOwnFile(fileNode)
    }
  }

  protected async removeOwnFile(fileNode: FILE_NODE): Promise<FILE_NODE | undefined> {
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

  protected async removeOtherFile(fileNode: FILE_NODE): Promise<FILE_NODE | undefined> {
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

    let pagination: PaginationResult<NODE> = { nextPageToken: undefined, list: [] }
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
   * @param key
   * @param input
   */
  setDirShareDetail(idToken: IdToken, key: StorageNodeGetKeyInput, input: SetShareDetailInput | null): Promise<NODE>

  /**
   * @see setDirShareDetail
   * @param key
   * @param input
   */
  setDirShareDetail(key: StorageNodeGetKeyInput, input: SetShareDetailInput | null): Promise<NODE>

  async setDirShareDetail(
    arg1: IdToken | StorageNodeGetKeyInput,
    arg2: StorageNodeGetKeyInput | (SetShareDetailInput | null),
    arg3?: SetShareDetailInput | null
  ): Promise<NODE> {
    let idToken: IdToken | undefined
    let key: StorageNodeGetKeyInput
    let input: SetShareDetailInput | null
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      key = arg2 as StorageNodeGetKeyInput
      input = arg3 as SetShareDetailInput | null
    } else {
      key = arg1
      input = arg2 as SetShareDetailInput | null
    }

    const dirNode = await this.sgetNode(key)

    if (idToken) {
      await this.validateBrowsable(idToken, dirNode.path)

      // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
      if (CoreStorageService.isOwnUserRootUnder(idToken, dirNode.path!) || idToken.isAppAdmin) {
        return this.setOwnDirShareDetail(dirNode, input)
      } else {
        return this.setOtherDirShareDetail(dirNode, input)
      }
    } else {
      return this.setOwnDirShareDetail(dirNode, input)
    }
  }

  protected async setOwnDirShareDetail(dirNode: NODE, input: SetShareDetailInput | null): Promise<NODE> {
    CoreStorageService.validateShareDetailInput(input)

    const share: StorageNodeShareDetail = this.toDBShareDetail(input, dirNode.share)
    await this.client.update({
      index: CoreStorageSchema.IndexAlias,
      id: dirNode.id,
      body: {
        doc: {
          ...CoreStorageSchema.toPathData(dirNode.path),
          share,
          version: dirNode.version + 1,
        },
      },
      refresh: true,
    })

    return await this.sgetNode({ id: dirNode.id })
  }

  protected async setOtherDirShareDetail(dirNode: NODE, input: SetShareDetailInput | null): Promise<NODE> {
    throw new AppError(`Not implemented yet.`)
  }

  /**
   * ファイルに対して共有設定を行います。
   * @param idToken
   * @param key
   * @param input
   */
  setFileShareDetail(idToken: IdToken, key: StorageNodeGetKeyInput, input: SetShareDetailInput | null): Promise<FILE_NODE>

  /**
   * @see setFileShareDetail
   * @param key
   * @param input
   */
  setFileShareDetail(key: StorageNodeGetKeyInput, input: SetShareDetailInput | null): Promise<FILE_NODE>

  async setFileShareDetail(
    arg1: IdToken | StorageNodeGetKeyInput,
    arg2: StorageNodeGetKeyInput | SetShareDetailInput | null,
    arg3?: SetShareDetailInput | null
  ): Promise<FILE_NODE> {
    let idToken: IdToken | undefined
    let key: StorageNodeGetKeyInput
    let input: SetShareDetailInput | null
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      key = arg2 as StorageNodeGetKeyInput
      input = arg3 as SetShareDetailInput | null
    } else {
      key = arg1
      input = arg2 as SetShareDetailInput | null
    }

    const fileNode = await this.sgetNode(key)

    if (idToken) {
      await this.validateBrowsable(idToken, fileNode.path)

      // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
      if (CoreStorageService.isOwnUserRootUnder(idToken, fileNode.path) || idToken.isAppAdmin) {
        return this.setOwnFileShareDetail(fileNode, input)
      } else {
        return this.setOtherFileShareDetail(fileNode, input)
      }
    } else {
      return this.setOwnFileShareDetail(fileNode, input)
    }
  }

  protected async setOwnFileShareDetail(fileNode: NODE, input: SetShareDetailInput | null): Promise<FILE_NODE> {
    CoreStorageService.validateShareDetailInput(input)

    const share: StorageNodeShareDetail = this.toDBShareDetail(input, fileNode.share)
    await this.client.update({
      index: CoreStorageSchema.IndexAlias,
      id: fileNode.id,
      body: {
        doc: {
          ...CoreStorageSchema.toPathData(fileNode.path),
          share,
          version: fileNode.version + 1,
        },
      },
      refresh: true,
    })

    return await this.sgetFileNode({ id: fileNode.id })
  }

  protected async setOtherFileShareDetail(fileNode: NODE, input: SetShareDetailInput | null): Promise<FILE_NODE> {
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
    const share = this.getInheritedShareDetail(hierarchicalNodes)

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
    await this.removeDir({ path: userRootPath })
  }

  /**
   * リクエスターが自身のノード情報を閲覧しようとしているか検証します。
   * @param idToken
   * @param nodePath_or_nodePaths
   */
  async validateBrowsable(idToken: IdToken | undefined, nodePath_or_nodePaths: string | undefined | string[]): Promise<void> {
    const error = await this.validateBrowsableImpl(idToken, nodePath_or_nodePaths)
    if (error) throw error
  }

  protected async validateBrowsableImpl(
    idToken: IdToken | undefined,
    nodePath_or_nodePaths: string | undefined | string[],
    hierarchicalNodes?: NODE[]
  ): Promise<HttpException | undefined> {
    let nodePaths: string[] = []
    if (Array.isArray(nodePath_or_nodePaths)) {
      nodePaths = nodePath_or_nodePaths
    } else if (typeof nodePath_or_nodePaths === 'string') {
      nodePaths = [nodePath_or_nodePaths]
    }

    // 指定されたパスをサマリー
    nodePaths = nodePaths.map(nodePath => {
      nodePath = removeBothEndsSlash(nodePath)
      CoreStorageService.validateNodePath(nodePath)
      return nodePath
    })
    nodePaths = summarizeFamilyPaths(nodePaths)

    // 指定されたノードと階層を構成するディレクトリを取得
    let nodeDict: { [path: string]: NODE } = {}
    if (hierarchicalNodes) {
      this.validateHierarchicalNodes(hierarchicalNodes)
      nodeDict = arrayToDict(hierarchicalNodes, 'path')
    } else {
      const hierarchicalPaths = splitHierarchicalPaths(...nodePaths)
      const nodes = await this.getNodes({ paths: hierarchicalPaths })
      nodeDict = arrayToDict(nodes, 'path')
    }

    // アプリケーションノードのパスを含んでいるか取得
    const hasAppNodePath = nodePaths.some(nodePath => CoreStorageService.isAppNode(nodePath))

    // 他ユーザーノードのパスを含んでいるか取得
    let hasOtherNodePath: boolean
    if (idToken) {
      hasOtherNodePath = nodePaths.some(nodePath => CoreStorageService.isOtherUserRootFamily(idToken!, nodePath))
    } else {
      hasOtherNodePath = true
    }

    // 自ユーザーノードにアクセスしようとしている場合、検証を終了
    // ※「アプリケーションノード or 他ユーザーノード」のパスを含んでないので
    if (!hasAppNodePath && !hasOtherNodePath) return undefined

    for (const nodePath of nodePaths) {
      // 自ユーザーがアプリケーション管理者の場合、次のパスへ移動
      if (idToken?.isAppAdmin) break

      // ノードを閲覧できる権限があることを検証
      const hierarchicalNodes = this.retrieveHierarchicalNodes(nodeDict, nodePath)
      const share = this.getInheritedShareDetail(hierarchicalNodes)
      const hasReadable = idToken && share.readUIds?.includes(idToken.uid)
      // ノードが非公開かつ、読み込み権限がない場合
      if (!share.isPublic && !hasReadable) {
        return new ForbiddenException(`The user cannot access to the node: ${JSON.stringify({ uid: idToken?.uid, nodePath })}`)
      }
    }

    return undefined
  }

  /**
   * リクエスターが指定されたノードを読み込み可能か検証します。
   * @param idToken
   * @param nodePath_or_nodePaths
   */
  async validateReadable(idToken: IdToken | undefined, nodePath_or_nodePaths: string | undefined | string[]): Promise<void> {
    const error = await this.validateReadableImpl(idToken, nodePath_or_nodePaths)
    if (error) throw error
  }

  protected async validateReadableImpl(
    idToken: IdToken | undefined,
    nodePath_or_nodePaths: string | undefined | string[],
    hierarchicalNodes?: NODE[]
  ): Promise<HttpException | undefined> {
    let nodePaths: string[] = []
    if (Array.isArray(nodePath_or_nodePaths)) {
      nodePaths = nodePath_or_nodePaths
    } else if (typeof nodePath_or_nodePaths === 'string') {
      nodePaths = [nodePath_or_nodePaths]
    }

    // 指定されたパスをサマリー
    nodePaths = nodePaths.map(nodePath => {
      nodePath = removeBothEndsSlash(nodePath)
      CoreStorageService.validateNodePath(nodePath)
      return nodePath
    })
    nodePaths = summarizeFamilyPaths(nodePaths)

    // 指定されたノードと階層を構成するディレクトリを取得
    let nodeDict: { [path: string]: NODE } = {}
    if (hierarchicalNodes) {
      this.validateHierarchicalNodes(hierarchicalNodes)
      nodeDict = arrayToDict(hierarchicalNodes, 'path')
    } else {
      const hierarchicalPaths = splitHierarchicalPaths(...nodePaths)
      const nodes = await this.getNodes({ paths: hierarchicalPaths })
      nodeDict = arrayToDict(nodes, 'path')
    }

    // アプリケーションノードのパスを含んでいるか取得
    const hasAppNodePath = nodePaths.some(nodePath => CoreStorageService.isAppNode(nodePath))

    // 他ユーザーノードのパスを含んでいるか取得
    let hasOtherNodePath: boolean
    if (idToken) {
      hasOtherNodePath = nodePaths.some(nodePath => CoreStorageService.isOtherUserRootFamily(idToken!, nodePath))
    } else {
      hasOtherNodePath = true
    }

    // 自ユーザーノードにアクセスしようとしている場合、検証を終了
    // ※「アプリケーションノード or 他ユーザーノード」のパスを含んでないので
    if (!hasAppNodePath && !hasOtherNodePath) return undefined

    for (const nodePath of nodePaths) {
      // アプリケーションノードかつ、自ユーザーがアプリケーション管理者の場合、次のパスへ移動
      if (CoreStorageService.isAppNode(nodePath) && idToken?.isAppAdmin) break

      // ノードを閲覧できる権限があることを検証
      // ※他ユーザーノードの場合、アプリケーション管理者であってもノードの読み込み権限に
      //   自ユーザーが設定されていないと読み込みできない
      const hierarchicalNodes = this.retrieveHierarchicalNodes(nodeDict, nodePath)
      const share = this.getInheritedShareDetail(hierarchicalNodes)
      const hasReadable = idToken && share.readUIds?.includes(idToken.uid)
      // ノードが非公開かつ、読み込み権限がない場合
      if (!share.isPublic && !hasReadable) {
        return new ForbiddenException(`The user cannot read to the node: ${JSON.stringify({ uid: idToken?.uid, nodePath })}`)
      }
    }

    return undefined
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

    // ファイルの公開フラグがオンの場合
    const share = await this.getInheritedShareDetail(fileNode.path)
    if (share.isPublic) {
      return this.streamFile(req, res, fileNode)
    }

    // リクエストユーザーが認証されていることを検証
    const validated = await this.authService.validate(req, res)
    if (!validated.result) {
      return res.sendStatus(validated.error!.getStatus())
    }
    const idToken = validated.idToken!

    // リクエストユーザーがファイルを閲覧できるか検証
    const error = await this.validateReadableImpl(idToken, fileNode.path)
    if (!error) {
      return this.streamFile(req, res, fileNode)
    } else {
      return res.sendStatus(error.getStatus())
    }
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

    const { result: notModified, status: notModifiedStatus, lastModified } = this.checkNotModified(req, fileNode)
    if (notModified) {
      return res.sendStatus(notModifiedStatus)
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
          const nodeId = CoreStorageSchema.generateId()
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
   * @param nodePath
   */
  protected getInheritedShareDetail(nodePath: string): Promise<Required<StorageNodeShareDetail>>

  /**
   * 指定されたノードをもとに、上位ディレクトリを加味した共有設定を取得します。
   * @param hierarchicalNodes
   *   階層構造が形成されたノードリストを指定。最後尾のノードの共有設定が取得されます。
   */
  protected getInheritedShareDetail(hierarchicalNodes: NODE[]): Required<StorageNodeShareDetail>

  protected getInheritedShareDetail(arg1: string | NODE[]): Promise<Required<StorageNodeShareDetail>> | Required<StorageNodeShareDetail> {
    const getResult = (hierarchicalNodes: NODE[]) => {
      hierarchicalNodes = CoreStorageService.sortNodes([...hierarchicalNodes]) as NODE[]

      const result: Required<StorageNodeShareDetail> = { isPublic: false, readUIds: null, writeUIds: null }
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

    if (typeof arg1 === 'string') {
      return this.getHierarchicalNodes(arg1).then(hierarchicalNodes => {
        return getResult(hierarchicalNodes)
      })
    } else {
      return getResult(arg1)
    }
  }

  /**
   * ストレージファイルをもとに、データベースのファイルノードを保存します。
   * @param fileNodePath
   * @param file
   * @param extra
   */
  async saveFileNode<EXTRA extends CoreStorageNode>(fileNodePath: string, file: File, extra?: DeepPartial<EXTRA>): Promise<FILE_NODE> {
    fileNodePath = removeBothEndsSlash(fileNodePath)
    const nodeId = file.name
    const existingNode = await this.getNode({ id: nodeId })
    const { share: extra_share, createdAt: extra_createdAt, updatedAt: extra_updatedAt, version: extra_version, ...extra_rest } =
      (extra as CoreStorageNode | undefined) ?? {}

    // ファイルノードに設定するタイムスタンプ+バージョンを取得
    const now = dayjs()
    const createdAt = extra_createdAt ?? existingNode?.createdAt ?? now
    const updatedAt = extra_updatedAt ?? now
    const version = extra_version ?? (existingNode ? existingNode.version + 1 : 1)

    // ファイルノードを作成/更新するデータを準備
    const fileNode: CoreStorageNode = {
      ...(existingNode ?? {}),
      id: nodeId,
      ...CoreStorageSchema.toPathData(fileNodePath),
      nodeType: 'File',
      share: this.toDBShareDetail(extra_share, existingNode?.share),
      contentType: file.metadata.contentType ?? '',
      size: file.metadata.size ? Number(file.metadata.size) : 0,
      createdAt,
      updatedAt,
      version,
      ...extra_rest,
    }

    // データベースにファイルノードを作成/更新
    await this.client.update({
      index: CoreStorageSchema.IndexAlias,
      id: nodeId,
      body: {
        doc: this.toDBStorageNode(fileNode as NODE),
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
   * @param fileNodePath
   * @param data
   * @param saveOptions
   * @param extra
   */
  protected async saveGCSFileAndFileNode<EXTRA extends CoreStorageNode>(
    fileNodePath: string,
    data: any,
    saveOptions?: SaveOptions,
    extra?: DeepPartial<EXTRA>
  ): Promise<FILE_NODE> {
    fileNodePath = removeBothEndsSlash(fileNodePath)
    const existingNode = await this.getNode({ path: fileNodePath })
    const nodeId = existingNode?.id || CoreStorageSchema.generateId()
    const { share: extra_share, createdAt: extra_createdAt, updatedAt: extra_updatedAt, version: extra_version, ...extra_rest } =
      (extra as CoreStorageNode | undefined) ?? {}

    //
    // ストレージファイルのコンテンツデータを保存
    //
    const bucket = admin.storage().bucket()
    const file = bucket.file(nodeId)
    await file.save(data, saveOptions)

    //
    // ファイルノードに設定するタイムスタンプ+バージョンを取得
    //
    const now = dayjs()
    const createdAt = extra_createdAt ?? existingNode?.createdAt ?? now
    const updatedAt = extra_updatedAt ?? now
    const version = extra_version ?? (existingNode ? existingNode.version + 1 : 1)

    //
    // ファイルノードを作成/更新するデータを準備
    //
    const fileNode: CoreStorageNode = {
      ...(existingNode ?? {}),
      id: nodeId,
      ...CoreStorageSchema.toPathData(fileNodePath),
      nodeType: 'File',
      share: this.toDBShareDetail(extra_share, existingNode?.share),
      contentType: saveOptions?.contentType ?? existingNode?.contentType ?? file.metadata.contentType ?? '',
      size: file.metadata.size ? Number(file.metadata.size) : 0,
      createdAt,
      updatedAt,
      version,
      ...extra_rest,
    }

    //
    // データベースにファイルノードを作成/更新
    //
    await this.client.update({
      index: CoreStorageSchema.IndexAlias,
      id: nodeId,
      body: {
        doc: this.toDBStorageNode(fileNode as NODE),
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
    return CoreStorageSchema.dbResponseToEntities(dbResponse) as NODE[]
  }

  /**
   * データベースから取得したノードの形式をアプリケーションで扱われる形式へ変換します。
   * @param dbNode
   * @protected
   */
  protected toStorageNode(dbNode: DB_NODE): NODE {
    return CoreStorageSchema.toEntity(dbNode) as NODE
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
   * 共有設定の入力値をデータベースの格納形式に変換します。
   * @param input
   * @param existing
   */
  protected toDBShareDetail(input?: SetShareDetailInput | null, existing?: StorageNodeShareDetail): StorageNodeShareDetail {
    let share!: StorageNodeShareDetail

    if (input === null) {
      share = CoreStorageSchema.EmptyShareDetail()
    } else {
      share = { ...CoreStorageSchema.EmptyShareDetail(), ...existing }

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

  /**
   * 指定されたノードが 304 Not Modified かチェックします。
   * @param req
   * @param target
   */
  protected checkNotModified(req: Request, target: Pick<NODE, 'updatedAt'>): { result: boolean; status: number; lastModified: string } {
    const lastModified = target.updatedAt.toString()
    const ifModifiedSinceStr = req.header('If-Modified-Since')
    const ifModifiedSince = ifModifiedSinceStr ? dayjs(ifModifiedSinceStr).toString() : undefined
    if (lastModified === ifModifiedSince) {
      return { result: true, status: 304, lastModified }
    }
    return { result: false, status: NaN, lastModified }
  }

  /**
   * ノードマップの中から、指定されたノードとそのノードを形成するディレクトリを取得します。
   * @param nodeDict
   * @param nodePath
   * @protected
   */
  protected retrieveHierarchicalNodes(nodeDict: { [path: string]: NODE }, nodePath: string): NODE[] {
    const hierarchicalPaths = splitHierarchicalPaths(nodePath)
    return hierarchicalPaths.reduce<NODE[]>((result, path) => {
      const node = nodeDict[path]
      node && result.push(node)
      return result
    }, [])
  }

  /**
   * 指定された階層構造ノードの中に欠けているノードがないか検証します。
   * @param hierarchicalNodes
   */
  protected validateHierarchicalNodes(hierarchicalNodes: NODE[]): void {
    const summarizedPaths = summarizeFamilyPaths(hierarchicalNodes.map(node => node.path))
    const nodeDict = arrayToDict(hierarchicalNodes, 'path')

    for (const summarizedPath of summarizedPaths) {
      for (const nodePath of splitHierarchicalPaths(summarizedPath)) {
        if (!nodeDict[nodePath]) {
          throw new AppError(`There is a missing node in the hierarchy.`, {
            hierarchicalNodes: hierarchicalNodes!.map(node => node.path),
            missingNode: nodePath,
          })
        }
      }
    }
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
  static validateShareDetailInput(input?: SetShareDetailInput | null): void {
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
  static retrieveUId(nodePath: string): string {
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
