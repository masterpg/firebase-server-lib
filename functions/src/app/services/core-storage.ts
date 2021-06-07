import * as _path from 'path'
import * as admin from 'firebase-admin'
import { AppError, validateUID } from '../base'
import { AuthServiceDI, AuthServiceModule } from './base-services/auth'
import {
  CoreStorageNode,
  CreateStorageDirInput,
  IdToken,
  MoveStorageDirInput,
  MoveStorageFileInput,
  NextTokenPaginationInput,
  NextTokenPaginationResult,
  RenameStorageDirInput,
  RenameStorageFileInput,
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
  notEmpty,
  pickProps,
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
import { ForbiddenException, Inject, Module } from '@nestjs/common'
import { Request, Response } from 'express'
import { AuthHelper } from './base/auth'
import { Dayjs } from 'dayjs'
import { HttpException } from '@nestjs/common/exceptions/http.exception'
import { config } from '../../config'
import dayjs = require('dayjs')
import escapeStringRegexp = require('escape-string-regexp')
import DocCoreStorageNode = CoreStorageSchema.DocCoreStorageNode

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

//========================================================================
//
//  Implementation
//
//========================================================================

class CoreStorageService<NODE extends CoreStorageNode = CoreStorageNode, FILE_NODE extends NODE & StorageFileNode = NODE & StorageFileNode> {
  constructor(@Inject(AuthServiceDI.symbol) protected readonly authService: AuthServiceDI.type) {}

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  protected readonly client = newElasticClient()

  protected readonly userHelper = new UserHelper(this.client)

  /**
   * データベースからの取得ノードで除外するフィールドを指定します。
   */
  protected get sourceExcludes(): string[] {
    return []
  }

  protected mergeSourceExcludes(sourceIncludes?: string[]): string[] {
    const result = [...this.sourceExcludes]
    if (!sourceIncludes) return result
    for (let i = 0; i < sourceIncludes.length; i++) {
      const sourceInclude = sourceIncludes[i]
      const foundIndex = result.indexOf(sourceInclude)
      if (foundIndex >= 0) {
        result.splice(foundIndex, 1)
        i--
      }
    }
    return result
  }

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  /**
   * 指定されたノードを取得します。
   * @param idToken
   * @param key
   * @param sourceIncludes
   */
  getNode(idToken: IdToken, key: StorageNodeGetKeyInput, sourceIncludes?: string[]): Promise<NODE | undefined>

  /**
   * @see getNode
   * @param key
   * @param sourceIncludes
   */
  getNode(key: StorageNodeGetKeyInput, sourceIncludes?: string[]): Promise<NODE | undefined>

  async getNode(arg1: IdToken | StorageNodeGetKeyInput, arg2?: StorageNodeGetKeyInput | string[], arg3?: string[]): Promise<NODE | undefined> {
    const _getNode = async (key: StorageNodeGetKeyInput, sourceIncludes?: string[]) => {
      const { id, path } = key

      const response = await this.client.search<ElasticSearchResponse<DocCoreStorageNode>>({
        index: CoreStorageSchema.IndexAlias,
        version: true,
        _source_excludes: this.mergeSourceExcludes(sourceIncludes),
        body: {
          query: {
            term: id ? { _id: id } : { path },
          },
        },
      })

      const nodes = this.toEntityNodes(response)
      return nodes.length ? nodes[0] : undefined
    }

    let idToken: IdToken | undefined
    let key: StorageNodeGetKeyInput
    let sourceIncludes: string[] | undefined
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      key = arg2 as StorageNodeGetKeyInput
      sourceIncludes = arg3
    } else {
      key = arg1
      sourceIncludes = arg2 as string[] | undefined
    }

    if (!key.id && !key.path) {
      return undefined
    }

    let result: CoreStorageNode | undefined
    if (key.id) {
      result = await _getNode({ id: key.id }, sourceIncludes)
    } else {
      CoreStorageService.validateNodePath(key.path)
      key.path = removeBothEndsSlash(key.path)
      result = await _getNode({ path: key.path }, sourceIncludes)
    }

    if (result) {
      idToken && (await this.validateBrowsable(idToken, result.path))
      return result as NODE
    } else {
      return
    }
  }

  /**
   * 指定されたノードを取得します。
   * 指定されたノードが見つからなかった場合、例外がスローされます。
   * @param idToken
   * @param key
   * @param sourceIncludes
   */
  sgetNode(idToken: IdToken, key: StorageNodeGetKeyInput, sourceIncludes?: string[]): Promise<NODE>

  /**
   * 指定されたノードを取得します。
   * 指定されたノードが見つからなかった場合、例外がスローされます。
   * @param key
   * @param sourceIncludes
   */
  sgetNode(key: StorageNodeGetKeyInput, sourceIncludes?: string[]): Promise<NODE>

  async sgetNode(arg1: IdToken | StorageNodeGetKeyInput, arg2?: StorageNodeGetKeyInput | string[], arg3?: string[]): Promise<NODE> {
    let idToken: IdToken | undefined
    let key: StorageNodeGetKeyInput
    let sourceIncludes: string[] | undefined
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      key = arg2 as StorageNodeGetKeyInput
      sourceIncludes = arg3
    } else {
      key = arg1
      sourceIncludes = arg2 as string[] | undefined
    }

    if (!key.id && !key.path) {
      throw new AppError(`Either 'id' or 'path' must be specified.`)
    }

    const node = await this.getNode(key, sourceIncludes)
    if (!node) {
      throw new AppError(`There is no node in the specified key.`, key)
    }

    idToken && (await this.validateBrowsable(idToken, node.path))

    return node
  }

  /**
   * 指定されたノードリストを取得します。
   * @param idToken
   * @param keys
   * @param sourceIncludes
   */
  getNodes(idToken: IdToken, keys: StorageNodeGetKeysInput, sourceIncludes?: string[]): Promise<NODE[]>

  /**
   * 指定されたノードリストを取得します。
   * @param keys
   * @param sourceIncludes
   */
  getNodes(keys: StorageNodeGetKeysInput, sourceIncludes?: string[]): Promise<NODE[]>

  async getNodes(arg1: IdToken | StorageNodeGetKeysInput, arg2?: StorageNodeGetKeysInput | string[], arg3?: string[]): Promise<NODE[]> {
    const _getNodes = async (keys: StorageNodeGetKeysInput, sourceIncludes?: string[]) => {
      const ids = keys.ids?.filter(notEmpty) || []
      let paths = keys.paths?.filter(notEmpty) || []
      const size = CoreStorageService.ChunkSize

      // 指定されたパスのバリデーションチェック
      paths.forEach(path => CoreStorageService.validateNodePath(path))
      paths = paths.map(path => removeBothEndsSlash(path))

      const nodes: CoreStorageNode[] = []

      for (const chunk of splitArrayChunk(ids, size)) {
        if (!chunk.length) break
        const response = await this.client.search<ElasticSearchResponse<DocCoreStorageNode>>({
          index: CoreStorageSchema.IndexAlias,
          size,
          version: true,
          _source_excludes: this.mergeSourceExcludes(sourceIncludes),
          body: {
            query: { terms: { _id: chunk } },
          },
        })
        nodes.push(...this.toEntityNodes(response))
      }

      for (const chunk of splitArrayChunk(paths, size)) {
        if (!chunk.length) break
        const response = await this.client.search<ElasticSearchResponse<DocCoreStorageNode>>({
          index: CoreStorageSchema.IndexAlias,
          size,
          version: true,
          _source_excludes: this.mergeSourceExcludes(sourceIncludes),
          body: {
            query: { terms: { path: chunk } },
          },
        })
        nodes.push(...this.toEntityNodes(response))
      }

      const nodeIdDict: { [id: string]: CoreStorageNode } = {}
      const nodePathDict: { [id: string]: CoreStorageNode } = {}
      for (const node of nodes) {
        nodeIdDict[node.id] = node
        nodePathDict[node.path] = node
      }

      const result: CoreStorageNode[] = []
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
    let keys: StorageNodeGetKeysInput
    let sourceIncludes: string[] | undefined
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      keys = arg2 as StorageNodeGetKeysInput
      sourceIncludes = arg3
    } else {
      keys = arg1
      sourceIncludes = arg2 as string[] | undefined
    }

    const nodes = await _getNodes(keys, sourceIncludes)

    if (idToken) {
      await this.validateBrowsable(
        idToken,
        nodes.map(node => node.path)
      )
    }

    return nodes as NODE[]
  }

  /**
   * 指定されたファイルノードを取得します。
   * @param idToken
   * @param key
   * @param sourceIncludes
   */
  getFileNode(idToken: IdToken, key: StorageNodeGetKeyInput, sourceIncludes?: string[]): Promise<FILE_NODE | undefined>

  /**
   * 指定されたファイルノードを取得します。
   * @param key
   * @param sourceIncludes
   */
  getFileNode(key: StorageNodeGetKeyInput, sourceIncludes?: string[]): Promise<FILE_NODE | undefined>

  async getFileNode(
    arg1: IdToken | StorageNodeGetKeyInput,
    arg2?: StorageNodeGetKeyInput | string[],
    arg3?: string[]
  ): Promise<FILE_NODE | undefined> {
    const _getNode = async (idToken: IdToken | undefined, key: StorageNodeGetKeyInput, sourceIncludes: string[] | undefined) => {
      if (idToken) {
        return this.getNode(idToken, key, sourceIncludes)
      } else {
        return this.getNode(key, sourceIncludes)
      }
    }

    let idToken: IdToken | undefined
    let key: StorageNodeGetKeyInput
    let sourceIncludes: string[] | undefined
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      key = arg2 as StorageNodeGetKeyInput
    } else {
      key = arg1
      sourceIncludes = arg3 as string[] | undefined
    }

    let node: CoreStorageNode | undefined
    let file: File | undefined

    if (key.id) {
      await Promise.all([
        _getNode(idToken, key, sourceIncludes).then(n => (node = n)),
        this.getStorageFile(key.id).then(ret => {
          ret.exists && (file = ret.file)
        }),
      ])
    } else {
      node = await _getNode(idToken, key, sourceIncludes)
      if (!node) return undefined
      const { file: f, exists } = await this.getStorageFile(node.id)
      exists && (file = f)
    }
    if (!(node && file)) return undefined

    return { ...node, file } as FILE_NODE
  }

  /**
   * @see sgetFileNode
   * @param idToken
   * @param key
   * @param sourceIncludes
   */
  sgetFileNode(idToken: IdToken, key: StorageNodeGetKeyInput, sourceIncludes?: string[]): Promise<FILE_NODE>

  /**
   * 指定されたファイルノードを取得します。
   * 指定されたファイルノードが見つからなかった場合、例外がスローされます。
   * @param key
   * @param sourceIncludes
   */
  sgetFileNode(key: StorageNodeGetKeyInput, sourceIncludes?: string[]): Promise<FILE_NODE>

  async sgetFileNode(arg1: IdToken | StorageNodeGetKeyInput, arg2?: StorageNodeGetKeyInput | string[], arg3?: string[]): Promise<FILE_NODE> {
    let idToken: IdToken | undefined
    let key: StorageNodeGetKeyInput
    let sourceIncludes: string[] | undefined
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      key = arg2 as StorageNodeGetKeyInput
    } else {
      key = arg1
      sourceIncludes = arg3 as string[] | undefined
    }

    let node: FILE_NODE | undefined
    if (idToken) {
      node = await this.getFileNode(idToken, key, sourceIncludes)
    } else {
      node = await this.getFileNode(key, sourceIncludes)
    }

    if (!node) {
      throw new AppError(`There is no node in the specified key.`, { key })
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
   * @param sourceIncludes
   */
  async getDescendants(
    idToken: IdToken,
    input: StorageNodeGetUnderInput,
    pagination?: NextTokenPaginationInput,
    sourceIncludes?: string[]
  ): Promise<NextTokenPaginationResult<NODE>>

  /**
   * @see getDescendants
   * @param input
   * @param pagination
   * @param sourceIncludes
   */
  async getDescendants(
    input: StorageNodeGetUnderInput,
    pagination?: NextTokenPaginationInput,
    sourceIncludes?: string[]
  ): Promise<NextTokenPaginationResult<NODE>>

  async getDescendants(
    arg1: IdToken | StorageNodeGetUnderInput,
    arg2?: StorageNodeGetUnderInput | NextTokenPaginationInput,
    arg3?: NextTokenPaginationInput | string[],
    arg4?: string[]
  ): Promise<NextTokenPaginationResult<NODE>> {
    let idToken: IdToken | undefined
    let input: StorageNodeGetUnderInput
    let pagination: NextTokenPaginationInput | undefined
    let sourceIncludes: string[] | undefined
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      input = arg2 as StorageNodeGetUnderInput
      pagination = arg3 as NextTokenPaginationInput | undefined
      sourceIncludes = arg4
    } else {
      input = arg1
      pagination = arg2 as NextTokenPaginationInput | undefined
      sourceIncludes = arg3 as string[] | undefined
    }

    let path: string
    const includeBase = input.includeBase

    if (!input.id && typeof input.path !== 'string') {
      throw new AppError(`Either 'id' or 'path' must be specified.`)
    }

    if (input.id) {
      const node = await this.getNode({ id: input.id })
      if (!node) return { list: [], total: 0 }
      path = node.path
    } else {
      CoreStorageService.validateNodePath(input.path)
      path = removeBothEndsSlash(input.path)
    }

    if (idToken) {
      // 自ユーザーのノードを検索
      // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
      if (CoreStorageService.isOwnUserRootFamily(idToken, path) || idToken.isAppAdmin) {
        return this.getDescendantsImpl({ path: path, includeBase }, pagination, sourceIncludes)
      }
      // 他ユーザーのノードを検索
      else {
        throw new AppError(`Not implemented yet.`)
      }
    } else {
      return this.getDescendantsImpl({ path, includeBase }, pagination, sourceIncludes)
    }
  }

  protected async getDescendantsImpl(
    { path, includeBase }: Omit<StorageNodeGetUnderInput, 'id'>,
    pagination?: NextTokenPaginationInput,
    sourceIncludes?: string[]
  ): Promise<NextTokenPaginationResult<NODE>> {
    // 指定されたパスのバリデーションチェック
    CoreStorageService.validateNodePath(path)
    path = removeBothEndsSlash(path)

    const pageSize = pagination?.pageSize || CoreStorageService.PageSize

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
                  filter: [{ term: { path } }, { term: { nodeType: 'Dir' } }],
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
    let response!: ElasticSearchAPIResponse<DocCoreStorageNode>
    try {
      response = await this.client.search<ElasticSearchResponse<DocCoreStorageNode>>({
        size: pageSize,
        version: true,
        _source_excludes: this.mergeSourceExcludes(sourceIncludes),
        body: {
          query,
          sort: [{ path: 'asc' }],
          ...pageToken,
        },
      })
    } catch (err) {
      if (isPaginationTimeout(err)) {
        return { list: [], total: 0, isPaginationTimeout: true }
      } else {
        throw err
      }
    }
    const nodes = this.toEntityNodes(response)

    // 指定ディレクトリを含む検索の、初回検索だった場合
    if (includeBase && path && !pagination?.pageToken) {
      // 指定ディレクトリパスのノードが存在しない場合
      if (!nodes.some(node => node.path === path)) {
        // 検索結果なしで終了
        return { list: [], total: 0 }
      }
    }

    // 次ページのページトークンを取得
    let nextPageToken: string | undefined
    const searchAfter = retrieveSearchAfter(response)
    if (nodes.length === 0 || nodes.length < pageSize) {
      nextPageToken = undefined
      searchAfter?.pitId && (await closePointInTime(this.client, searchAfter.pitId))
    } else {
      if (searchAfter?.pitId && searchAfter?.sort) {
        nextPageToken = encodePageToken(searchAfter.pitId, searchAfter.sort)
      } else {
        nextPageToken = undefined
      }
    }

    return {
      nextPageToken,
      list: nodes as NODE[],
      total: response.body.hits.total.value,
    }
  }

  /**
   * 指定されたディレクトリ配下のノード数を取得します。
   * @param idToken
   * @param input
   */
  getDescendantsCount(idToken: IdToken, input: StorageNodeGetUnderInput): Promise<number>

  /**
   * 指定されたディレクトリ配下のノード数を取得します。
   * @param input
   */
  getDescendantsCount(input: StorageNodeGetUnderInput): Promise<number>

  async getDescendantsCount(arg1: IdToken | StorageNodeGetUnderInput, arg2?: StorageNodeGetUnderInput): Promise<number> {
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

    if (!input.id && typeof input.path !== 'string') {
      throw new AppError(`Either 'id' or 'path' must be specified.`)
    }

    if (input.id) {
      const node = await this.getNode({ id: input.id })
      if (!node) return 0
      path = node.path
    } else {
      CoreStorageService.validateNodePath(input.path)
      path = removeBothEndsSlash(input.path)
    }

    if (idToken) {
      // 自ユーザーのノードを検索
      // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
      if (CoreStorageService.isOwnUserRootFamily(idToken, path) || idToken.isAppAdmin) {
        return this.getDescendantsCountImpl({ path: path, includeBase })
      }
      // 他ユーザーのノードを検索
      else {
        throw new AppError(`Not implemented yet.`)
      }
    } else {
      return this.getDescendantsCountImpl({ path, includeBase })
    }
  }

  protected async getDescendantsCountImpl({ path, includeBase }: { path: string; includeBase?: boolean }): Promise<number> {
    // 指定されたパスのバリデーションチェック
    CoreStorageService.validateNodePath(path)
    path = removeBothEndsSlash(path)

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
                  filter: [{ term: { path } }, { term: { nodeType: 'Dir' } }],
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

  /**
   * 指定されたディレクトリ直下のノードを取得します。
   * @param idToken
   * @param input
   * @param pagination
   * @param sourceIncludes
   */
  async getChildren(
    idToken: IdToken,
    input: StorageNodeGetUnderInput,
    pagination?: NextTokenPaginationInput,
    sourceIncludes?: string[]
  ): Promise<NextTokenPaginationResult<NODE>>

  /**
   * 指定されたディレクトリ直下のノードを取得します。
   * @param input
   * @param pagination
   * @param sourceIncludes
   */
  async getChildren(
    input: StorageNodeGetUnderInput,
    pagination?: NextTokenPaginationInput,
    sourceIncludes?: string[]
  ): Promise<NextTokenPaginationResult<NODE>>

  async getChildren(
    arg1: IdToken | StorageNodeGetUnderInput,
    arg2?: StorageNodeGetUnderInput | NextTokenPaginationInput,
    arg3?: NextTokenPaginationInput | string[],
    arg4?: string[]
  ): Promise<NextTokenPaginationResult<NODE>> {
    let idToken: IdToken | undefined
    let input: StorageNodeGetUnderInput
    let pagination: NextTokenPaginationInput | undefined
    let sourceIncludes: string[] | undefined
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      input = arg2 as StorageNodeGetUnderInput
      pagination = arg3 as NextTokenPaginationInput | undefined
      sourceIncludes = arg4
    } else {
      input = arg1
      pagination = arg2 as NextTokenPaginationInput | undefined
      sourceIncludes = arg3 as string[] | undefined
    }

    let path: string
    const includeBase = input.includeBase

    if (!input.id && typeof input.path !== 'string') {
      throw new AppError(`Either 'id' or 'path' must be specified.`)
    }

    if (input.id) {
      const node = await this.getNode({ id: input.id })
      if (!node) return { list: [], total: 0 }
      path = node.path
    } else {
      CoreStorageService.validateNodePath(input.path)
      path = removeBothEndsSlash(input.path)
    }

    if (idToken) {
      // 自ユーザーのノードを検索
      // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
      if (CoreStorageService.isOwnUserRootFamily(idToken, path) || idToken.isAppAdmin) {
        return this.getChildrenImpl({ path, includeBase }, pagination, sourceIncludes)
      }
      // 他ユーザーのノードを検索
      else {
        throw new AppError(`Not implemented yet.`)
      }
    } else {
      return this.getChildrenImpl({ path, includeBase }, pagination, sourceIncludes)
    }
  }

  protected async getChildrenImpl(
    { path, includeBase }: Omit<StorageNodeGetUnderInput, 'id'>,
    pagination?: NextTokenPaginationInput,
    sourceIncludes?: string[]
  ): Promise<NextTokenPaginationResult<NODE>> {
    // 指定されたパスのバリデーションチェック
    CoreStorageService.validateNodePath(path)
    path = removeBothEndsSlash(path)

    const pageSize = pagination?.pageSize || CoreStorageService.PageSize

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
                  filter: [{ term: { path } }, { term: { nodeType: 'Dir' } }],
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
    let response!: ElasticSearchAPIResponse<DocCoreStorageNode>
    try {
      response = await this.client.search<ElasticSearchResponse<DocCoreStorageNode>>({
        size: pageSize,
        version: true,
        _source_excludes: this.mergeSourceExcludes(sourceIncludes),
        body: {
          query,
          sort: [{ path: 'asc' }],
          ...pageToken,
        },
      })
    } catch (err) {
      if (isPaginationTimeout(err)) {
        return { list: [], total: 0, isPaginationTimeout: true }
      } else {
        throw err
      }
    }
    const nodes = this.toEntityNodes(response)

    // 指定ディレクトリを含む検索の、初回検索だった場合
    if (includeBase && path && !pagination?.pageToken) {
      // 指定ディレクトリパスのノードが存在しない場合
      if (!nodes.some(node => node.path === path)) {
        // 検索結果なしで終了
        return { list: [], total: 0 }
      }
    }

    // 次ページのページトークンを取得
    let nextPageToken: string | undefined
    const searchAfter = retrieveSearchAfter(response)
    if (nodes.length === 0 || nodes.length < pageSize) {
      nextPageToken = undefined
      searchAfter?.pitId && (await closePointInTime(this.client, searchAfter.pitId))
    } else {
      if (searchAfter?.pitId && searchAfter?.sort) {
        nextPageToken = encodePageToken(searchAfter.pitId, searchAfter.sort)
      } else {
        nextPageToken = undefined
      }
    }

    return {
      nextPageToken,
      list: nodes as NODE[],
      total: response.body.hits.total.value,
    }
  }

  /**
   * 指定されたディレクトリ直下のノード数を取得します。
   * @param idToken
   * @param input
   */
  getChildrenCount(idToken: IdToken, input: StorageNodeGetUnderInput): Promise<number>

  /**
   * 指定されたディレクトリ直下のノード数を取得します。
   * @param input
   */
  getChildrenCount(input: StorageNodeGetUnderInput): Promise<number>

  async getChildrenCount(arg1: IdToken | StorageNodeGetUnderInput, arg2?: StorageNodeGetUnderInput): Promise<number> {
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

    if (!input.id && typeof input.path !== 'string') {
      throw new AppError(`Either 'id' or 'path' must be specified.`)
    }

    if (input.id) {
      const node = await this.getNode({ id: input.id })
      if (!node) return 0
      path = node.path
    } else {
      CoreStorageService.validateNodePath(input.path)
      path = removeBothEndsSlash(input.path)
    }

    if (idToken) {
      // 自ユーザーのノードを検索
      // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
      if (CoreStorageService.isOwnUserRootFamily(idToken, path) || idToken.isAppAdmin) {
        return this.getChildrenCountImpl({ path, includeBase })
      }
      // 他ユーザーのノードを検索
      else {
        throw new AppError(`Not implemented yet.`)
      }
    } else {
      return this.getChildrenCountImpl({ path, includeBase })
    }
  }

  protected async getChildrenCountImpl({ path, includeBase }: { path: string; includeBase?: boolean }): Promise<number> {
    // 指定されたパスのバリデーションチェック
    CoreStorageService.validateNodePath(path)
    path = removeBothEndsSlash(path)

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
                  filter: [{ term: { path } }, { term: { nodeType: 'Dir' } }],
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

  /**
   * 指定されたノードとその階層構造を形成するノードを取得します。
   * @param idToken
   * @param nodePath
   * @param sourceIncludes
   */
  getHierarchicalNodes(idToken: IdToken, nodePath: string, sourceIncludes?: string[]): Promise<NODE[]>

  /**
   * 指定されたノードとその階層構造を形成するノードを取得します。
   * @param nodePath
   * @param sourceIncludes
   */
  getHierarchicalNodes(nodePath: string, sourceIncludes?: string[]): Promise<NODE[]>

  async getHierarchicalNodes(arg1: IdToken | string, arg2?: string | string[], arg3?: string[]): Promise<NODE[]> {
    let idToken: IdToken | undefined
    let nodePath: string
    let sourceIncludes: string[] | undefined
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      nodePath = arg2 as string
      sourceIncludes = arg3
    } else {
      nodePath = arg1
      sourceIncludes = arg2 as string[] | undefined
    }

    if (!nodePath) return []

    // 指定されたパスのバリデーションチェック
    nodePath = removeBothEndsSlash(nodePath)
    CoreStorageService.validateNodePath(nodePath)

    if (idToken) {
      // 自ユーザーのノードを検索
      // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
      if (CoreStorageService.isOwnUserRootFamily(idToken, nodePath) || idToken.isAppAdmin) {
        return this.getHierarchicalNodesImpl(nodePath, sourceIncludes)
      }
      // 他ユーザーのノードを検索
      else {
        throw new AppError(`Not implemented yet.`)
      }
    } else {
      return this.getHierarchicalNodesImpl(nodePath, sourceIncludes)
    }
  }

  protected async getHierarchicalNodesImpl(nodePath: string, sourceIncludes?: string[]): Promise<NODE[]> {
    // 指定されたパスのバリデーションチェック
    nodePath = removeBothEndsSlash(nodePath)
    CoreStorageService.validateNodePath(nodePath)

    // 引数ノードとその階層を取得
    const hierarchicalPaths = splitHierarchicalPaths(nodePath)
    const hierarchicalNodes = await this.getNodes({ paths: hierarchicalPaths }, sourceIncludes)
    if (!hierarchicalNodes.length) return []

    // 引数ノードを取得
    const node = hierarchicalNodes[hierarchicalNodes.length - 1]
    // 引数ノードが存在する場合
    // ※引数ノードが存在するので、祖先ノードも存在しなくてはならない
    if (node.path === nodePath) {
      // 欠けている祖先ノードがあった場合
      const hierarchicalNodeDict = arrayToDict(hierarchicalNodes, 'path')
      for (const hierarchicalPath of hierarchicalPaths) {
        if (!hierarchicalNodeDict[hierarchicalPath]) {
          throw new AppError(`The ancestor of the node you are trying to retrieve does not exist.`, {
            node: { path: nodePath },
            ancestor: { path: hierarchicalPath },
          })
        }
      }
    }

    return CoreStorageService.sortNodes(hierarchicalNodes) as NODE[]
  }

  /**
   * 指定されたノードの階層構造を形成する祖先ディレクトリを取得します。
   * @param idToken
   * @param nodePath
   * @param sourceIncludes
   */
  getAncestorDirs(idToken: IdToken, nodePath: string, sourceIncludes?: string[]): Promise<NODE[]>

  /**
   * 指定されたノードの階層構造を形成する祖先ディレクトリを取得します。
   * @param nodePath
   * @param sourceIncludes
   */
  getAncestorDirs(nodePath: string, sourceIncludes?: string[]): Promise<NODE[]>

  async getAncestorDirs(arg1: IdToken | string, arg2?: string | string[], arg3?: string[]): Promise<NODE[]> {
    let result: NODE[]
    let idToken: IdToken | undefined
    let nodePath: string
    let sourceIncludes: string[] | undefined
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      nodePath = arg2 as string
      sourceIncludes = arg3
      result = await this.getHierarchicalNodes(idToken, nodePath, sourceIncludes)
    } else {
      nodePath = arg1
      sourceIncludes = arg2 as string[] | undefined
      result = await this.getHierarchicalNodes(nodePath)
    }
    return result.filter(node => node.path !== nodePath)
  }

  /**
   * ディレクトリを作成します。
   * @param idToken
   * @param input
   */
  createDir(idToken: IdToken, input: CreateStorageDirInput): Promise<NODE>

  /**
   * @see createDir
   * @param input
   */
  createDir(input: CreateStorageDirInput): Promise<NODE>

  async createDir(arg1: IdToken | CreateStorageDirInput, arg2?: CreateStorageDirInput): Promise<NODE> {
    let idToken: IdToken | undefined
    let input: CreateStorageDirInput
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      input = arg2!
    } else {
      input = arg1
    }

    // 指定されたパスのバリデーションチェック
    CoreStorageService.validateNodePath(input.dir)
    input.dir = removeBothEndsSlash(input.dir)

    if (idToken) {
      // 自ユーザーのノードに対する処理
      // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
      if (CoreStorageService.isOwnUserRootFamily(idToken, input.dir) || idToken.isAppAdmin) {
        return this.createDirImpl(input)
      }
      // 他ユーザーのノードに対する処理
      else {
        throw new AppError(`Not implemented yet.`)
      }
    } else {
      return this.createDirImpl(input)
    }
  }

  protected async createDirImpl({ dir, share }: CreateStorageDirInput): Promise<NODE> {
    // 指定されたパスのバリデーションチェック
    dir = removeBothEndsSlash(dir)
    CoreStorageService.validateNodePath(dir)

    // 共有設定の入力値を検証
    CoreStorageService.validateShareDetailInput(share)

    // 引数ディレクトリの階層構造形成に必要なノードを取得
    const hierarchicalDirNodes = await this.getRequiredHierarchicalDirNodes(dir)
    const ancestorDirNodes = hierarchicalDirNodes.filter(node => node.path !== dir)
    const hierarchicalDirNodeDict = arrayToDict(hierarchicalDirNodes, 'path')

    for (const ancestorDirNode of ancestorDirNodes) {
      // 祖先ディレクトリが存在することをチェック
      if (!ancestorDirNode.exists) {
        throw new AppError(`The ancestor directory of the specified directory does not exist.`, {
          specifiedPath: dir,
          ancestorPath: ancestorDirNode.path,
        })
      }
    }

    const dirNode = hierarchicalDirNodeDict[dir]
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
            ...this.toDocNode(dirNode),
            share: this.toDocShareDetail(share),
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
      if (share) {
        return await this.setDirShareDetail({ path: dir }, share)
      } else {
        return (await this.getNode({ path: dir }))!
      }
    }
  }

  /**
   * 指定されたディレクトリの階層構造を形成するのに必要なディレクトリを作成します。
   *
   * 引数が次のように指定された場合、
   *   + dirs[0]: 'home/photos'
   *   + dirs[1]: 'home/docs'
   *
   * 次のディレクトリが作成されます。
   *   + 'home'
   *   + 'home/photos'
   *   + 'home/docs'
   *
   * @param idToken
   * @param dirs
   */
  createHierarchicalDirs(idToken: IdToken, dirs: string[]): Promise<NODE[]>

  /**
   * @see createHierarchicalDirs
   * @param dirs
   */
  createHierarchicalDirs(dirs: string[]): Promise<NODE[]>

  async createHierarchicalDirs(arg1: IdToken | string[], arg2?: string[]): Promise<NODE[]> {
    let idToken: IdToken | undefined
    let dirs: string[]
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      dirs = arg2 as string[]
    } else {
      dirs = arg1
    }

    // 指定されたパスのバリデーションチェック
    dirs.forEach(dir => CoreStorageService.validateNodePath(dir))
    dirs = dirs.map(dir => removeBothEndsSlash(dir))

    if (idToken) {
      const ownDirPaths: string[] = []
      const otherDirPaths: string[] = []
      for (const dir of dirs) {
        // 自ユーザーのノードに対する処理
        // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
        if (CoreStorageService.isOwnUserRootFamily(idToken, dir) || idToken.isAppAdmin) {
          ownDirPaths.push(dir)
        }
        // 他ユーザーのノードに対する処理
        else {
          otherDirPaths.push(dir)
        }
      }

      const result: NODE[] = []
      if (otherDirPaths.length) {
        throw new AppError(`Not implemented yet.`)
      }
      if (ownDirPaths.length) {
        const nodes = await this.createHierarchicalDirsImpl(ownDirPaths)
        result.push(...nodes)
      }

      return result
    } else {
      return this.createHierarchicalDirsImpl(dirs)
    }
  }

  protected async createHierarchicalDirsImpl(dirs: string[]): Promise<NODE[]> {
    // 指定されたパスのバリデーションチェック
    dirs.forEach(dir => CoreStorageService.validateNodePath(dir))
    dirs = dirs.map(dir => removeBothEndsSlash(dir))

    // 引数ディレクトリの階層構造形成に必要なノードを取得
    const hierarchicalDirNodes = await this.getRequiredHierarchicalDirNodes(...dirs)

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
        ...this.toDocNode(dirNode),
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

  /**
   * 指定されたディレクトリを含め配下のノードを削除します。
   *
   * 引数が次のように指定された場合、
   *   + dir: 'home/photos'
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
  removeDir(idToken: IdToken, key: StorageNodeGetKeyInput, pagination?: { pageSize?: number }): Promise<void>

  /**
   * @see removeDir
   * @param key
   * @param pagination
   */
  removeDir(key: StorageNodeGetKeyInput, pagination?: { pageSize?: number }): Promise<void>

  async removeDir(
    arg1: IdToken | StorageNodeGetKeyInput,
    arg2?: StorageNodeGetKeyInput | { pageSize?: number },
    arg3?: { pageSize?: number }
  ): Promise<void> {
    let idToken: IdToken | undefined
    let key: StorageNodeGetKeyInput
    let pagination: { pageSize?: number } | undefined
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      key = arg2 as StorageNodeGetKeyInput
      pagination = arg3
    } else {
      key = arg1
      pagination = arg2 as { pageSize?: number } | undefined
    }

    const dirNode = await this.getNode(key)
    if (!dirNode) return

    if (idToken) {
      // 自ユーザーのノードに対する処理
      // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
      if (CoreStorageService.isOwnUserRootFamily(idToken, dirNode.path) || idToken.isAppAdmin) {
        return this.removeDirImpl(dirNode, pagination)
      }
      // 他ユーザーのノードに対する処理
      else {
        throw new AppError(`Not implemented yet.`)
      }
    } else {
      return this.removeDirImpl(dirNode, pagination)
    }
  }

  protected async removeDirImpl(dirNode: NODE, pagination?: { pageSize?: number }): Promise<void> {
    const bucket = admin.storage().bucket()
    const size = pagination?.pageSize ?? CoreStorageService.ChunkSize
    let nodes: { id: string; path: string }[]
    const pageToken: ElasticPageToken = {
      pit: await openPointInTime(this.client, CoreStorageSchema.IndexAlias),
    }

    do {
      // データベースから引数ディレクトリ配下のファイルノードを取得
      const response = await this.client.search<ElasticSearchResponse<{ path: string }>>({
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
        _source: ['path'],
      })
      nodes = response.body.hits.hits.map(hit => {
        return { id: hit._id, path: hit._source.path }
      })

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
      // 自ユーザーのノードに対する処理
      // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
      if (CoreStorageService.isOwnUserRootUnder(idToken, fileNode.path) || idToken.isAppAdmin) {
        return this.removeFileImpl(fileNode)
      }
      // 他ユーザーのノードに対する処理
      else {
        throw new AppError(`Not implemented yet.`)
      }
    } else {
      return this.removeFileImpl(fileNode)
    }
  }

  protected async removeFileImpl(fileNode: FILE_NODE): Promise<FILE_NODE | undefined> {
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

  /**
   * ディレクトリの移動を行います。
   *
   * 引数が次のように指定された場合、
   *   + fromDir: 'home/photos'
   *   + toDir: 'home/archives/photos'
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
   * @param input
   * @param options
   */
  moveDir(idToken: IdToken, input: MoveStorageDirInput, options?: { pageSize?: number }): Promise<void>

  /**
   * @see moveDir
   * @param input
   * @param options
   */
  moveDir(input: MoveStorageDirInput, options?: { pageSize?: number }): Promise<void>

  async moveDir(
    arg1: IdToken | MoveStorageDirInput,
    arg2?: MoveStorageDirInput | { pageSize?: number },
    arg3?: { pageSize?: number } | undefined
  ): Promise<void> {
    let idToken: IdToken | undefined
    let input: MoveStorageDirInput
    let options: { pageSize?: number } | undefined
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      input = arg2 as MoveStorageDirInput
      options = arg3
    } else {
      input = arg1
      options = arg2 as { pageSize?: number } | undefined
    }

    // 指定されたパスのバリデーションチェック
    input.fromDir = removeBothEndsSlash(input.fromDir)
    CoreStorageService.validateNodePath(input.fromDir)
    input.toDir = removeBothEndsSlash(input.toDir)
    CoreStorageService.validateNodePath(input.toDir)

    if (idToken) {
      // アプリケーション管理者の場合
      if (idToken.isAppAdmin) {
        return this.moveDirImpl(input, options)
      }
      // アプリケーション管理者以外の場合
      else {
        // ユーザールートに対する処理
        if (CoreStorageService.isUserRoot(input.fromDir)) {
          throw new AppError(`You do not have permission to move the user root directory.`, { uid: idToken.uid })
        }

        // 自ユーザーのノードに対する処理
        if (CoreStorageService.isOwnUserRootFamily(idToken, input.fromDir) && CoreStorageService.isOwnUserRootUnder(idToken, input.toDir)) {
          return this.moveDirImpl(input, options)
        }
        // 他ユーザーのノードに対する処理
        else {
          throw new AppError(`Not implemented yet.`)
        }
      }
    } else {
      return this.moveDirImpl(input, options)
    }
  }

  protected async moveDirImpl({ fromDir: fromDirPath, toDir: toDirPath }: MoveStorageDirInput, options?: { pageSize?: number }): Promise<void> {
    // 指定されたパスのバリデーションチェック
    fromDirPath = removeBothEndsSlash(fromDirPath)
    CoreStorageService.validateNodePath(fromDirPath)
    toDirPath = removeBothEndsSlash(toDirPath)
    CoreStorageService.validateNodePath(toDirPath)

    const pageSize = options?.pageSize ?? 1000

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

    const fromDir = await this.getNode({ path: fromDirPath })
    if (!fromDir) {
      throw new AppError(`The node to be moved does not exist.`, { path: fromDirPath })
    }
    if (fromDir.nodeType !== 'Dir') {
      throw new AppError(`The node to be moved is not directory.`, { from: pickProps(fromDir, ['id', 'path', 'nodeType']) })
    }

    // 移動先の所属ディレクトリの存在確認
    // ※バケット直下への移動時はディレクトリの存在確認はしない
    const toParentPath = removeStartDirChars(_path.dirname(toDirPath))
    if (toParentPath) {
      const toParentNode = await this.getNode({ path: toParentPath })
      if (!toParentNode) {
        throw new AppError(`The destination directory does not exist: '${toParentPath}'`)
      }
      if (toParentNode.nodeType !== 'Dir') {
        throw new AppError(`The destination node is not directory.`, { to: pickProps(toParentNode, ['id', 'path', 'nodeType']) })
      }
    }

    let pagination: NextTokenPaginationResult<NODE> = { nextPageToken: undefined, list: [], total: 0 }
    do {
      pagination = await this.getDescendantsImpl(
        { path: fromDirPath, includeBase: true },
        {
          pageSize,
          pageToken: pagination.nextPageToken,
        }
      )

      // 移動元ノードのパスを移動先のパスへ変換するための正規表現
      const reg = new RegExp(`^${escapeStringRegexp(fromDirPath)}`)

      // 以降の処理を行いやすくするためにデータ加工
      const { toNodes, toFileNodes } = pagination.list.reduce(
        (result, node) => {
          const toNodePath = node.path.replace(reg, toDirPath)
          const toNode = {
            ...node,
            name: _path.basename(toNodePath),
            dir: _path.dirname(toNodePath),
            path: toNodePath,
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
              _id: toNodes.map(toNode => toNode.id),
            },
          },
          script: {
            lang: 'painless',
            source: `
              ctx._source.name = params[ctx._id].name;
              ctx._source.dir = params[ctx._id].dir;
              ctx._source.path = params[ctx._id].path;
            `,
            params: toNodes.reduce((result, toNode) => {
              const { name, dir, path } = toNode
              result[toNode.id] = { name, dir, path }
              return result
            }, {} as { [id: string]: { name: string; dir: string; path: string } }),
          },
        },
        refresh: true,
      })
    } while (pagination.nextPageToken)
  }

  /**
   * ファイルを指定されたディレクトリへ移動します。
   *
   * 引数が次のように指定された場合、
   *   + fromFile: 'home/photos/family.png'
   *   + toFile: 'home/archives/family.png'
   *
   * 次のようなファイルの移動が行われます。
   *   + 移動元: 'home/photos/family.png'
   *   + 移動先: 'home/archives/family.png'
   *
   * 移動元ファイルまたは移動先ディレクトリがない場合、移動は行われず、戻り値は何も返しません。
   *
   * @param idToken
   * @param input
   */
  moveFile(idToken: IdToken, input: MoveStorageFileInput): Promise<FILE_NODE>

  /**
   * @see moveFile
   * @param input
   */
  moveFile(input: MoveStorageFileInput): Promise<FILE_NODE>

  async moveFile(arg1: IdToken | MoveStorageFileInput, arg2?: MoveStorageFileInput): Promise<FILE_NODE> {
    let idToken: IdToken | undefined
    let input: MoveStorageFileInput
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      input = arg2!
    } else {
      input = arg1
    }

    // 指定されたパスのバリデーションチェック
    input.fromFile = removeBothEndsSlash(input.fromFile)
    CoreStorageService.validateNodePath(input.fromFile)
    input.toFile = removeBothEndsSlash(input.toFile)
    CoreStorageService.validateNodePath(input.toFile)

    if (idToken) {
      // 自ユーザーのノードに対する処理
      // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
      if (
        (CoreStorageService.isOwnUserRootUnder(idToken, input.fromFile) && CoreStorageService.isOwnUserRootUnder(idToken, input.toFile)) ||
        idToken.isAppAdmin
      ) {
        return this.moveFileImpl(input)
      }
      // 他ユーザーのノードに対する処理
      else {
        throw new AppError(`Not implemented yet.`)
      }
    } else {
      return this.moveFileImpl(input)
    }
  }

  protected async moveFileImpl({ fromFile: fromFilePath, toFile: toFilePath }: MoveStorageFileInput): Promise<FILE_NODE> {
    // 指定されたパスのバリデーションチェック
    fromFilePath = removeBothEndsSlash(fromFilePath)
    CoreStorageService.validateNodePath(fromFilePath)
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
      if (toParentNode.nodeType !== 'Dir') {
        throw new AppError(`The destination node is not directory.`, { to: pickProps(toParentNode, ['id', 'path', 'nodeType']) })
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
    await this.client.update({
      index: CoreStorageSchema.IndexAlias,
      id: fileNode.id,
      body: {
        doc: CoreStorageSchema.toPathData(toFilePath),
      },
      refresh: true,
    })

    return this.sgetFileNode({ id: fileNode.id })
  }

  /**
   * ディレクトリの名前変更を行います。
   *
   * 引数が次のように指定された場合、
   *   + dir: 'home/photos'
   *   + name: 'my-photos'
   *
   * 次のようなディレクトリの名前変更が行われます。
   *   + 変更前: 'home/photos'
   *   + 変更後: 'home/my-photos'
   *
   * リネームするディレクトリがない場合、リネームは行われず、空配列が返されます。
   *
   * @param idToken
   * @param input
   * @param options
   */
  renameDir(idToken: IdToken, input: RenameStorageDirInput, options?: { pageSize?: number }): Promise<void>

  /**
   * @see renameDir
   * @param input
   * @param options
   */
  renameDir(input: RenameStorageDirInput, options?: { pageSize?: number }): Promise<void>

  async renameDir(
    arg1: IdToken | RenameStorageDirInput,
    arg2?: RenameStorageDirInput | { pageSize?: number },
    arg3?: { pageSize?: number }
  ): Promise<void> {
    let idToken: IdToken | undefined
    let input: RenameStorageDirInput
    let options: { pageSize?: number } | undefined
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      input = arg2 as RenameStorageDirInput
      options = arg3
    } else {
      input = arg1
      options = arg2 as { pageSize?: number } | undefined
    }

    // 指定されたパスのバリデーションチェック
    input.dir = removeBothEndsSlash(input.dir)
    CoreStorageService.validateNodePath(input.dir)

    if (idToken) {
      // アプリケーション管理者の場合
      if (idToken.isAppAdmin) {
        return this.renameDirImpl(input, options)
      }
      // アプリケーション管理者以外の場合
      else {
        // ユーザールートに対する処理
        if (CoreStorageService.isUserRoot(input.dir)) {
          throw new AppError(`You do not have permission to rename the user root directory.`, { uid: idToken.uid })
        }

        // 自ユーザーのノードに対する処理
        if (CoreStorageService.isOwnUserRootFamily(idToken, input.dir)) {
          return this.renameDirImpl(input, options)
        }
        // 他ユーザーのノードに対する処理
        else {
          throw new AppError(`Not implemented yet.`)
        }
      }
    } else {
      return this.renameDirImpl(input, options)
    }
  }

  protected async renameDirImpl({ dir: fromDirPath, name: newName }: RenameStorageDirInput, options?: { pageSize?: number }): Promise<void> {
    // 指定されたパスのバリデーションチェック
    fromDirPath = removeBothEndsSlash(fromDirPath)
    CoreStorageService.validateNodePath(fromDirPath)
    // 指定された名前のバリデーションチェック
    CoreStorageService.validateNodeName(newName)

    // リネームした際のパスを作成
    const reg = new RegExp(`${escapeStringRegexp(_path.basename(fromDirPath))}$`)
    const toDirPath = fromDirPath.replace(reg, newName)

    // 既に同じ名前のディレクトリがある場合
    const toDirNode = await this.getNode({ path: toDirPath })
    if (toDirNode) {
      throw new AppError(`The specified directory name already exists: '${fromDirPath}' -> '${toDirPath}'`)
    }

    return await this.moveDirImpl({ fromDir: fromDirPath, toDir: toDirPath }, options)
  }

  /**
   * ファイルの名前変更を行います。
   *
   * 引数が次のように指定された場合、
   *   + file: 'photos/family.png'
   *   + name: 'my-family.png'
   *
   * 次のような名前変更が行われます。
   *   + 変更前: 'photos/family.png'
   *   + 変更後: 'photos/my-family.png'
   *
   * リネームするファイルがない場合、移動行われず、戻り値は何も返しません。
   *
   * @param idToken
   * @param input
   */
  renameFile(idToken: IdToken, input: RenameStorageFileInput): Promise<FILE_NODE>

  /**
   * @see renameFile
   * @param input
   */
  renameFile(input: RenameStorageFileInput): Promise<FILE_NODE>

  async renameFile(arg1: IdToken | RenameStorageFileInput, arg2?: RenameStorageFileInput): Promise<FILE_NODE> {
    let idToken: IdToken | undefined
    let input: RenameStorageFileInput
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      input = arg2!
    } else {
      input = arg1
    }

    // 指定されたパスのバリデーションチェック
    input.file = removeBothEndsSlash(input.file)
    CoreStorageService.validateNodePath(input.file)

    if (idToken) {
      // 自ユーザーのノードに対する処理
      // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
      if (CoreStorageService.isOwnUserRootUnder(idToken, input.file) || idToken.isAppAdmin) {
        return this.renameFileImpl(input)
      }
      // 他ユーザーのノードに対する処理
      else {
        throw new AppError(`Not implemented yet.`)
      }
    } else {
      return this.renameFileImpl(input)
    }
  }

  protected async renameFileImpl({ file: fromFilePath, name: newName }: RenameStorageFileInput): Promise<FILE_NODE> {
    // 指定されたパスのバリデーションチェック
    fromFilePath = removeBothEndsSlash(fromFilePath)
    CoreStorageService.validateNodePath(fromFilePath)
    // 指定された名前のバリデーションチェック
    CoreStorageService.validateNodeName(newName)

    // リネームした際のパスを作成
    const reg = new RegExp(`${escapeStringRegexp(_path.basename(fromFilePath))}$`)
    const toFilePath = fromFilePath.replace(reg, newName)

    // 既に同じ名前のファイルがある場合
    const toFileNode = await this.getFileNode({ path: toFilePath })
    if (toFileNode) {
      throw new AppError(`The specified file name already exists: '${fromFilePath}' -> '${toFilePath}'`)
    }

    return await this.moveFileImpl({ fromFile: fromFilePath, toFile: toFilePath })
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
    if (dirNode.nodeType !== 'Dir') {
      throw new AppError(`The node to be shared is not directory.`, { to: pickProps(dirNode, ['id', 'path', 'nodeType']) })
    }

    if (idToken) {
      // アプリケーション管理者の場合
      if (idToken.isAppAdmin) {
        return this.setDirShareDetailImpl(dirNode, input)
      }
      // アプリケーション管理者以外の場合
      else {
        // ユーザールートに対する処理
        if (CoreStorageService.isUserRoot(dirNode.path)) {
          throw new AppError(`You do not have permission to set share detail the user root directory.`, { uid: idToken.uid })
        }

        // 自ユーザーのノードに対する処理
        if (CoreStorageService.isOwnUserRootUnder(idToken, dirNode.path)) {
          return this.setDirShareDetailImpl(dirNode, input)
        }
        // 他ユーザーのノードに対する処理
        else {
          throw new AppError(`Not implemented yet.`)
        }
      }
    } else {
      return this.setDirShareDetailImpl(dirNode, input)
    }
  }

  protected async setDirShareDetailImpl(dirNode: NODE, input: SetShareDetailInput | null): Promise<NODE> {
    CoreStorageService.validateShareDetailInput(input)

    const share: StorageNodeShareDetail = this.toDocShareDetail(input, dirNode.share)
    await this.client.update({
      index: CoreStorageSchema.IndexAlias,
      id: dirNode.id,
      body: {
        doc: {
          ...CoreStorageSchema.toPathData(dirNode.path),
          share,
        },
      },
      refresh: true,
    })

    return await this.sgetNode({ id: dirNode.id })
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
    if (fileNode.nodeType !== 'File') {
      throw new AppError(`The node to be shared is not file.`, { to: pickProps(fileNode, ['id', 'path', 'nodeType']) })
    }

    if (idToken) {
      // 自ユーザーのノードに対する処理
      // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
      if (CoreStorageService.isOwnUserRootUnder(idToken, fileNode.path) || idToken.isAppAdmin) {
        return this.setFileShareDetailImpl(fileNode, input)
      }
      // 他ユーザーのノードに対する処理
      else {
        throw new AppError(`Not implemented yet.`)
      }
    } else {
      return this.setFileShareDetailImpl(fileNode, input)
    }
  }

  protected async setFileShareDetailImpl(fileNode: NODE, input: SetShareDetailInput | null): Promise<FILE_NODE> {
    CoreStorageService.validateShareDetailInput(input)

    const share: StorageNodeShareDetail = this.toDocShareDetail(input, fileNode.share)
    await this.client.update({
      index: CoreStorageSchema.IndexAlias,
      id: fileNode.id,
      body: {
        doc: {
          ...CoreStorageSchema.toPathData(fileNode.path),
          share,
        },
      },
      refresh: true,
    })

    return await this.sgetFileNode({ id: fileNode.id })
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

    // 指定されたパスのバリデーションチェック
    input.path = removeBothEndsSlash(input.path)
    CoreStorageService.validateNodePath(input.path)

    if (idToken) {
      // 自ユーザーのノードに対する処理
      // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
      if (CoreStorageService.isOwnUserRootUnder(idToken, input.path) || idToken.isAppAdmin) {
        return this.handleUploadedFileImpl(input)
      }
      // 他ユーザーのノードに対する処理
      else {
        throw new AppError(`Not implemented yet.`)
      }
    } else {
      return this.handleUploadedFileImpl(input)
    }
  }

  protected async handleUploadedFileImpl(input: StorageNodeKeyInput): Promise<FILE_NODE> {
    // 指定されたパスのバリデーションチェック
    input.path = removeBothEndsSlash(input.path)
    CoreStorageService.validateNodePath(input.path)

    const { id: nodeId, path: nodePath } = input

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

    // 指定されたパスのバリデーションチェック
    inputs.forEach(input => CoreStorageService.validateNodePath(input.path))

    if (idToken) {
      const ownInputs: SignedUploadUrlInput[] = []
      const otherInputs: SignedUploadUrlInput[] = []
      for (const input of inputs) {
        // 自ユーザーのノードに対する処理
        // ※アプリケーション管理者の場合、他ユーザーのノードであっても自身のものと仮定する
        if (CoreStorageService.isOwnUserRootUnder(idToken, input.path) || idToken.isAppAdmin) {
          ownInputs.push(input)
        }
        // 他ユーザーのノードに対する処理
        else {
          otherInputs.push(input)
        }
      }

      const result: string[] = []
      if (otherInputs.length) {
        throw new AppError(`Not implemented yet.`)
      }
      if (ownInputs.length) {
        const nodes = await this.getSignedUploadUrlsImpl(requestOrigin, inputs)
        result.push(...nodes)
      }

      return result
    } else {
      return this.getSignedUploadUrlsImpl(requestOrigin, inputs)
    }
  }

  protected async getSignedUploadUrlsImpl(requestOrigin: string, inputs: SignedUploadUrlInput[]): Promise<string[]> {
    // 指定されたパスのバリデーションチェック
    inputs.forEach(input => CoreStorageService.validateNodePath(input.path))

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
   * @param pageSize
   */
  async deleteUserDir(uid: string, pageSize = CoreStorageService.PageSize): Promise<void> {
    const userRootPath = CoreStorageService.toUserRootPath({ uid })
    await this.removeDir({ path: userRootPath })
  }

  /**
   * リクエスターが自身のノード情報を閲覧しようとしているか検証します。
   * @param idToken リクエスターのトークン。
   * @param nodePath_or_nodePaths 検証すべきノードパスまたはノードパスリスト。
   * @param hierarchicalNodes `nodePath_or_nodePaths`の階層ノードリスト。呼び出し側で事前に
   *   階層ノードリストを取得している場合、引数に渡すことで処理負荷を軽減することができます。
   */
  async validateBrowsable(
    idToken: IdToken | undefined,
    nodePath_or_nodePaths: string | undefined | string[],
    hierarchicalNodes?: NODE[]
  ): Promise<void> {
    const error = await this.validateBrowsableImpl(idToken, nodePath_or_nodePaths, hierarchicalNodes)
    if (error) throw error
  }

  protected async validateBrowsableImpl(
    idToken: IdToken | undefined,
    nodePath_or_nodePaths: string | undefined | string[],
    hierarchicalNodes?: NODE[]
  ): Promise<HttpException | undefined> {
    return this.validateBaseAccessible({
      idToken,
      nodePath_or_nodePaths,
      hierarchicalNodes,
      validate: ({ idToken, node, share }) => {
        // リクエスターがアプリケーション管理者の場合、次のノードへ移動
        if (idToken?.isAppAdmin) return undefined
        // 対象ノードの読み込み権限があるかを取得
        const hasReadable = idToken && share.readUIds?.includes(idToken.uid)
        // 対象ノードが非公開かつ読み込み権限がない場合、権限なしエラー
        if (!share.isPublic && !hasReadable) {
          return new ForbiddenException(`The user cannot access to the node: ${JSON.stringify({ uid: idToken?.uid, nodePath: node.path })}`)
        }
        return undefined
      },
    })
  }

  /**
   * リクエスターが指定されたノードを読み込み可能か検証します。
   * @param idToken リクエスターのトークン。
   * @param nodePath_or_nodePaths 検証すべきノードパスまたはノードパスリスト。
   * @param hierarchicalNodes `nodePath_or_nodePaths`の階層ノードリスト。呼び出し側で事前に
   *   階層ノードリストを取得している場合、引数に渡すことで処理負荷を軽減することができます。
   */
  async validateReadable(
    idToken: IdToken | undefined,
    nodePath_or_nodePaths: string | undefined | string[],
    hierarchicalNodes?: NODE[]
  ): Promise<void> {
    const error = await this.validateReadableImpl(idToken, nodePath_or_nodePaths, hierarchicalNodes)
    if (error) throw error
  }

  protected async validateReadableImpl(
    idToken: IdToken | undefined,
    nodePath_or_nodePaths: string | undefined | string[],
    hierarchicalNodes?: NODE[]
  ): Promise<HttpException | undefined> {
    return this.validateBaseAccessible({
      idToken,
      nodePath_or_nodePaths,
      hierarchicalNodes,
      validate: ({ idToken, node, share }) => {
        // リクエスターがアプリケーション管理者かつ、対象ノードがアプリケーションノードの場合、
        // 次のノードへ移動。※アプリケーション管理者はアプリケーションノード読み込み可能なので。
        if (idToken?.isAppAdmin && CoreStorageService.isAppNode(node.path)) return
        // 対象ノードの読み込み権限があるかを取得
        const hasReadable = idToken && share.readUIds?.includes(idToken.uid)
        // 対象ノードが非公開かつ読み込み権限がない場合、権限なしエラー
        // ※アプリケーション管理者であっても読み込み権限がない場合、対象ノード（ファイル）の
        //   読み込みはできない。ただし閲覧は可能。
        if (!share.isPublic && !hasReadable) {
          return new ForbiddenException(`The user cannot read to the node: ${JSON.stringify({ uid: idToken?.uid, nodePath: node.path })}`)
        }
        return undefined
      },
    })
  }

  /**
   * リクエスターが指定されたノードを書き込み可能か検証します。
   * @param idToken リクエスターのトークン。
   * @param nodePath_or_nodePaths 検証すべきノードパスまたはノードパスリスト。
   * @param hierarchicalNodes `nodePath_or_nodePaths`の階層ノードリスト。呼び出し側で事前に
   *   階層ノードリストを取得している場合、引数に渡すことで処理負荷を軽減することができます。
   */
  async validateWritable(
    idToken: IdToken | undefined,
    nodePath_or_nodePaths: string | undefined | string[],
    hierarchicalNodes?: NODE[]
  ): Promise<void> {
    const error = await this.validateReadableImpl(idToken, nodePath_or_nodePaths, hierarchicalNodes)
    if (error) throw error
  }

  protected async validateWritableImpl(
    idToken: IdToken | undefined,
    nodePath_or_nodePaths: string | undefined | string[],
    hierarchicalNodes?: NODE[]
  ): Promise<HttpException | undefined> {
    return this.validateBaseAccessible({
      idToken,
      nodePath_or_nodePaths,
      hierarchicalNodes,
      validate: ({ idToken, node, share }) => {
        // リクエスターがアプリケーション管理者かつ、対象ノードがアプリケーションノードの場合、
        // 次のノードへ移動。※アプリケーション管理者はアプリケーションノード書き込み可能なので。
        if (idToken?.isAppAdmin && CoreStorageService.isAppNode(node.path)) return
        // 対象ノードの書き込み権限があるかを取得
        const hasWritable = idToken && share.writeUIds?.includes(idToken.uid)
        // 対象ノードが非公開かつ書き込み権限がない場合、権限なしエラー
        // ※アプリケーション管理者であっても書き込み権限がない場合、対象ノード（ファイル）の
        //   書き込みはできない。
        if (!share.isPublic && !hasWritable) {
          return new ForbiddenException(`The user cannot read to the node: ${JSON.stringify({ uid: idToken?.uid, nodePath: node.path })}`)
        }
        return undefined
      },
    })
  }

  /**
   * ノードへのアクセス権限を検証するためのベース関数です。
   * @param params
   * - idToken: リクエスターのトークン。<br>
   * - nodePath_or_nodePaths: 検証すべきノードパスまたはノードパスリスト。<br>
   * - hierarchicalNodes: `nodePath_or_nodePaths`の階層ノードリスト。呼び出し側で事前に
   *   階層ノードリストを取得している場合、引数に渡すことで処理負荷を軽減することができます。<br>
   * - validate: ノードのアクセス権限を検証する関数。`nodePath_or_nodePaths`で指定されたノード
   *   単位で呼び出されます。<br>
   */
  protected async validateBaseAccessible(params: {
    idToken: IdToken | undefined
    nodePath_or_nodePaths: string | undefined | string[]
    hierarchicalNodes?: NODE[]
    validate: (params: { idToken: IdToken | undefined; node: NODE; share: StorageNodeShareDetail }) => HttpException | undefined
  }): Promise<HttpException | undefined> {
    const { idToken, nodePath_or_nodePaths, hierarchicalNodes, validate } = params

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

    // 指定されたノードと階層を構成するディレクトリを取得
    let nodeDict: { [path: string]: NODE } = {}
    if (hierarchicalNodes) {
      CoreStorageService.validateHierarchicalNodes(hierarchicalNodes)
      nodeDict = arrayToDict(hierarchicalNodes, 'path')
    } else {
      const hierarchicalPaths = splitHierarchicalPaths(...nodePaths)
      const nodes = await this.getNodes({ paths: hierarchicalPaths })
      nodeDict = arrayToDict(nodes, 'path')
    }

    for (const nodePath of nodePaths) {
      // 対象ノードを取得
      const node = nodeDict[nodePath]
      // 対象ノードとその上位ディレクトリを加味した共有設定を取得
      const hierarchicalNodes = CoreStorageService.retrieveHierarchicalNodes(nodeDict, node.path)
      const share = this.getInheritedShareDetail(hierarchicalNodes)
      // リクエスターがノードにアクセスできるか検証
      const error = validate({ idToken, node, share })
      if (error) return error
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

    // ファイルの階層構造を形成するノードを取得
    const hierarchicalNodes = await this.getHierarchicalNodes(fileNode.path)

    // ファイルの公開フラグがオンの場合
    const share = await this.getInheritedShareDetail(hierarchicalNodes)
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
    const error = await this.validateReadableImpl(idToken, fileNode.path, hierarchicalNodes)
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

    const notModified = this.checkNotModified(req, fileNode.updatedAt!)
    if (notModified.result) {
      return res.sendStatus(notModified.status)
    }
    res.setHeader('Last-Modified', notModified.lastModified)
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
    const dirs = uploadList
      .map(uploadItem => {
        return removeStartDirChars(_path.dirname(uploadItem.path))
      })
      .filter(dir => Boolean(dir))
    const hierarchicalDirNodes = await this.getRequiredHierarchicalDirNodes(...dirs)
    for (const dirNode of hierarchicalDirNodes) {
      if (!dirNode.exists) {
        throw new AppError(`The directory '${dirNode.path}' to upload to does not exist.`)
      }
    }

    const uploadedFileDict: { [path: string]: FILE_NODE } = {}
    for (const chunk of splitArrayChunk(uploadList, CoreStorageService.PageSize)) {
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
    const dirs = uploadList
      .map(uploadItem => {
        return removeStartDirChars(_path.dirname(uploadItem.fileNodePath))
      })
      .filter(dir => Boolean(dir))
    const hierarchicalDirNodes = await this.getRequiredHierarchicalDirNodes(...dirs)
    for (const dirNode of hierarchicalDirNodes) {
      if (!dirNode.exists) {
        throw new AppError(`The directory '${dirNode.path}' to upload to does not exist.`)
      }
    }

    const uploadedFileDict: { [path: string]: FILE_NODE } = {}
    const bucket = admin.storage().bucket()
    for (const chunk of splitArrayChunk(uploadList, CoreStorageService.PageSize)) {
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
   * @param dirs
   */
  protected async getRequiredHierarchicalDirNodes(...dirs: string[]): Promise<(NODE & { exists: boolean })[]> {
    // 指定ディレクトリの階層構造を形成するのに必要なノードパスを取得
    const hierarchicalPaths = splitHierarchicalPaths(...dirs)

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

      const result: Required<StorageNodeShareDetail> = { isPublic: null, readUIds: null, writeUIds: null }
      for (const node of hierarchicalNodes) {
        if (typeof node.share.isPublic === 'boolean') {
          // 上位で明示的に非公開が設定されている場合、下位公開設定は無視される
          if (result.isPublic !== false) {
            result.isPublic = node.share.isPublic
          }
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
    const { share: extra_share, createdAt: extra_createdAt, updatedAt: extra_updatedAt, ...extra_rest } = (extra as CoreStorageNode | undefined) ?? {}

    // ファイルノードに設定するタイムスタンプ+バージョンを取得
    const now = dayjs()
    const createdAt = extra_createdAt ?? existingNode?.createdAt ?? extra_updatedAt ?? now
    const updatedAt = extra_updatedAt ?? now

    // ファイルノードを作成/更新するデータを準備
    const fileNode: Omit<CoreStorageNode, 'id' | 'version'> = {
      ...(existingNode ?? {}),
      ...CoreStorageSchema.toPathData(fileNodePath),
      nodeType: 'File',
      share: this.toDocShareDetail(extra_share, existingNode?.share),
      contentType: file.metadata.contentType ?? '',
      size: file.metadata.size ? Number(file.metadata.size) : 0,
      createdAt,
      updatedAt,
      ...extra_rest,
    }

    // データベースにファイルノードを作成/更新
    await this.client.update({
      index: CoreStorageSchema.IndexAlias,
      id: nodeId,
      body: {
        doc: this.toDocNode(fileNode),
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
    const { share: extra_share, createdAt: extra_createdAt, updatedAt: extra_updatedAt, ...extra_rest } = (extra as CoreStorageNode | undefined) ?? {}

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
    const createdAt = extra_createdAt ?? existingNode?.createdAt ?? extra_updatedAt ?? now
    const updatedAt = extra_updatedAt ?? now

    //
    // ファイルノードを作成/更新するデータを準備
    //
    const fileNode: Omit<CoreStorageNode, 'id' | 'version'> = {
      ...(existingNode ?? {}),
      ...CoreStorageSchema.toPathData(fileNodePath),
      nodeType: 'File',
      share: this.toDocShareDetail(extra_share, existingNode?.share),
      contentType: saveOptions?.contentType ?? existingNode?.contentType ?? file.metadata.contentType ?? '',
      size: file.metadata.size ? Number(file.metadata.size) : 0,
      createdAt,
      updatedAt,
      ...extra_rest,
    }

    //
    // データベースにファイルノードを作成/更新
    //
    await this.client.update({
      index: CoreStorageSchema.IndexAlias,
      id: nodeId,
      body: {
        doc: this.toDocNode(fileNode),
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
  protected toEntityNodes<T extends DeepPartial<DocCoreStorageNode>>(dbResponse: ElasticSearchAPIResponse<T> | ElasticMSearchAPIResponse<T>) {
    return CoreStorageSchema.toEntities(dbResponse)
  }

  /**
   * ノードをデータベースへ保存するプロパティのみに絞り込みます。
   * @param node
   */
  protected toDocNode(node: DeepPartial<CoreStorageNode>) {
    return CoreStorageSchema.toDoc(node)
  }

  /**
   * 指定された`dir`を`CoreStorageNode`へ変換します。
   * @param dir
   */
  protected dirPathToStorageNode(dir: string): NODE {
    dir = removeBothEndsSlash(dir)

    return {
      id: '',
      nodeType: 'Dir',
      ...CoreStorageSchema.toPathData(dir),
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
  protected toDocShareDetail(input?: SetShareDetailInput | null, existing?: StorageNodeShareDetail): StorageNodeShareDetail {
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
   * @param updatedA
   * t
   */
  protected checkNotModified(req: Request, updatedAt: Dayjs): { result: boolean; status: number; lastModified: string } {
    const lastModified = updatedAt.toString()
    const ifModifiedSinceStr = req.header('If-Modified-Since')
    const ifModifiedSince = ifModifiedSinceStr ? dayjs(ifModifiedSinceStr).toString() : undefined
    if (lastModified === ifModifiedSince) {
      return { result: true, status: 304, lastModified }
    }
    return { result: false, status: NaN, lastModified }
  }

  //----------------------------------------------------------------------
  //
  //  Static
  //
  //----------------------------------------------------------------------

  static readonly PageSize = 50

  static readonly ChunkSize = 3000

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

    if (Buffer.byteLength(nodeName) > 255) {
      throw new AppError('The specified node name is too long.', {
        'nodeName.byteLength': Buffer.byteLength(nodeName),
      })
    }

    // 改行、タブが含まれないことを検証
    if (/\r?\n|\t/g.test(nodeName)) {
      throw new AppError('The specified node name is invalid.', {
        nodeName,
      })
    }

    // 『 \ / : * ? " < > | 』が含まれないことを検証
    if (/[\\/:*?"<>|]/g.test(nodeName)) {
      throw new AppError('The specified node name is invalid.', { nodeName })
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
   * 指定されたパスがあるユーザーのユーザールートか否かを取得します。
   * @param nodePath
   */
  static isUserRoot(nodePath: string): boolean {
    const reg = new RegExp(`^${config.storage.user.rootName}/[^/]+$`)
    return reg.test(nodePath)
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

  /**
   * ノードマップの中から、指定されたノードとそのノードを形成するディレクトリを取得します。
   * @param nodeDict
   * @param nodePath
   */
  static retrieveHierarchicalNodes<NODE extends CoreStorageNode>(nodeDict: { [path: string]: NODE }, nodePath: string): NODE[] {
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
  static validateHierarchicalNodes<NODE extends CoreStorageNode>(hierarchicalNodes: NODE[]): void {
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
