import * as _path from 'path'
import {
  ArticleTableOfContentsNode,
  CoreStorageSchema,
  CreateArticleTypeDirInput,
  CreateStorageNodeOptions,
  GetArticleChildrenInput,
  IdToken,
  SaveArticleMasterSrcFileResult,
  SetShareDetailInput,
  StorageArticleDetail,
  StorageArticleDirType,
  StorageNode,
  StorageNodeGetKeyInput,
  StorageNodeType,
  StoragePaginationInput,
  StoragePaginationResult,
  StorageSchema,
} from './base'
import { AuthServiceDI, AuthServiceModule } from './base-services/auth'
import { ElasticMSearchAPIResponse, ElasticMSearchResponse, ElasticSearchAPIResponse, ElasticSearchResponse } from '../base/elastic'
import { Inject, Module } from '@nestjs/common'
import { Request, Response } from 'express'
import {
  RequiredAre,
  arrayToDict,
  pickProps,
  removeBothEndsSlash,
  removeStartDirChars,
  splitHierarchicalPaths,
  summarizeFamilyPaths,
} from 'web-base-lib'
import { AppError } from '../base'
import { AuthHelper } from './base/auth'
import { CoreStorageService } from './core-storage'
import { File } from '@google-cloud/storage'
import { config } from '../../config'
import dayjs = require('dayjs')
import DBStorageNode = StorageSchema.DBStorageNode

//========================================================================
//
//  Interfaces
//
//========================================================================

interface StorageFileNode extends StorageNode {
  file: File
}

interface TreeStorageNode<NODE extends StorageNode = StorageNode> {
  item: NODE
  parent?: TreeStorageNode<NODE>
  children: TreeStorageNode<NODE>[]
}

//========================================================================
//
//  Implementation
//
//========================================================================

class StorageService extends CoreStorageService<StorageNode, StorageFileNode, DBStorageNode> {
  constructor(@Inject(AuthServiceDI.symbol) protected readonly authService: AuthServiceDI.type) {
    super(authService)
  }

  //----------------------------------------------------------------------
  //
  //  Variables
  //
  //----------------------------------------------------------------------

  protected get excludeNodeFields(): string[] {
    return [...super.excludeNodeFields, 'article.src.textContent']
  }

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  //--------------------------------------------------
  //  Article
  //--------------------------------------------------

  /**
   * 記事の本文ノードと下書きノードを取得します。
   * @param articleDirPath
   */
  async getArticleSrcFiles(articleDirPath: string): Promise<{ master: StorageNode; draft: StorageNode }> {
    const paths = [StorageService.toArticleSrcMasterPath(articleDirPath), StorageService.toArticleSrcDraftPath(articleDirPath)]

    const response = await this.client.search<ElasticSearchResponse<DBStorageNode>>({
      index: CoreStorageSchema.IndexAlias,
      size: 2,
      body: {
        query: { terms: { path: paths } },
      },
      _source_includes: this.includeNodeFields,
      _source_excludes: this.excludeNodeFields,
    })

    const result = this.dbResponseToNodes(response).reduce<{ master: StorageNode; draft: StorageNode }>((result, node) => {
      if (node.article?.src?.type === 'Master') {
        result.master = node
      } else if (node.article?.src?.type === 'Draft') {
        result.draft = node
      }
      return result
    }, {} as any)

    if (!result.master) {
      throw new AppError(`The master src for the article could not be found.`, { articleDirPath })
    }
    if (!result.draft) {
      throw new AppError(`The draft src for the article could not be found.`, { articleDirPath })
    }

    return result
  }

  /**
   * 記事系ディレクトリを作成します。
   * @param idToken
   * @param input
   * @param options
   */
  createArticleTypeDir(idToken: IdToken, input: CreateArticleTypeDirInput, options?: CreateStorageNodeOptions): Promise<StorageNode>

  /**
   * @see createOwnArticleTypeDir
   * @param input
   * @param options
   */
  createArticleTypeDir(input: CreateArticleTypeDirInput, options?: CreateStorageNodeOptions): Promise<StorageNode>

  async createArticleTypeDir(
    arg1: IdToken | CreateArticleTypeDirInput,
    arg2?: CreateArticleTypeDirInput | CreateStorageNodeOptions,
    arg3?: CreateStorageNodeOptions
  ): Promise<StorageNode> {
    let idToken: IdToken | undefined
    let input: CreateArticleTypeDirInput
    let options: CreateStorageNodeOptions | undefined
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      input = arg2 as CreateArticleTypeDirInput
      options = arg3
    } else {
      input = arg1
      options = arg2 as CreateStorageNodeOptions | undefined
    }

    if (idToken) {
      await this.validateBrowsable(idToken, input.dir)

      if (CoreStorageService.isOwnUserRootUnder(idToken, input.dir) || idToken.isAppAdmin) {
        return this.createOwnArticleTypeDir(input, options)
      } else {
        return this.createOtherArticleTypeDir(input, options)
      }
    } else {
      return this.createOwnArticleTypeDir(input, options)
    }
  }

  async createOwnArticleTypeDir(input: CreateArticleTypeDirInput, options?: CreateStorageNodeOptions): Promise<StorageNode> {
    // 作成するノードのソート順を取得
    let sortOrder: number
    if (typeof input.sortOrder === 'number') {
      sortOrder = input.sortOrder
    } else {
      sortOrder =
        (await this.m_getMaxArticleSortOrder({
          path: input.dir,
        })) + 1
    }

    // ディレクトリ作成
    let result!: StorageNode
    switch (input.type) {
      case 'ListBundle':
      case 'TreeBundle':
        result = await this.m_createArticleBundle({ ...input, sortOrder }, options)
        break
      case 'Category':
        result = await this.m_createArticleCategory({ ...input, sortOrder }, options)
        break
      case 'Article':
        result = await this.m_createArticle({ ...input, sortOrder }, options)
        break
    }
    return result
  }

  async createOtherArticleTypeDir(input: CreateArticleTypeDirInput, options?: CreateStorageNodeOptions): Promise<StorageNode> {
    throw new AppError(`Not implemented yet.`)
  }

  /**
   * 記事ルート配下に一般ディレクトリを作成します。
   * @param idToken
   * @param dirPath
   * @param options
   */
  createArticleGeneralDir(idToken: IdToken, dirPath: string, options?: CreateStorageNodeOptions): Promise<StorageNode>

  /**
   * @see createArticleGeneralDir
   * @param dirPath
   * @param options
   */
  createArticleGeneralDir(dirPath: string, options?: CreateStorageNodeOptions): Promise<StorageNode>

  async createArticleGeneralDir(
    arg1: IdToken | string,
    arg2?: string | CreateStorageNodeOptions,
    arg3?: CreateStorageNodeOptions
  ): Promise<StorageNode> {
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

      if (CoreStorageService.isOwnUserRootUnder(idToken, dirPath) || idToken.isAppAdmin) {
        return this.createOwnArticleGeneralDir(dirPath, options)
      } else {
        return this.createOtherArticleGeneralDir(dirPath, options)
      }
    } else {
      return this.createOwnArticleGeneralDir(dirPath, options)
    }
  }

  async createOwnArticleGeneralDir(dirPath: string, options?: CreateStorageNodeOptions): Promise<StorageNode> {
    StorageService.validateNodePath(dirPath)

    // 引数ディレクトリのパスが記事ルート配下のものか検証
    this.m_validateArticleRootUnder(dirPath)

    const userRootName = config.storage.user.rootName
    const articleRootName = config.storage.article.rootName
    const assetsName = config.storage.article.assetsName

    const hierarchicalDirNodes = await this.getRequiredHierarchicalDirNodes(dirPath)
    const ancestorDirNodes = hierarchicalDirNodes.filter(node => node.path !== dirPath)
    const hierarchicalDirNodeDict = arrayToDict(hierarchicalDirNodes, 'path')

    // 祖先ディレクトリが存在することを検証
    for (const iDirNode of ancestorDirNodes) {
      if (!iDirNode.exists) {
        throw new AppError(`The ancestor of the specified path does not exist.`, {
          specifiedPath: dirPath,
          ancestorPath: iDirNode.path,
        })
      }
    }

    // 引数パスがアセットとその配下以外の場合
    // ※アセットとその配下はディレクトリ作成が可能なので、このブロック内の検証を行う必要はない
    const reg = new RegExp(`^${userRootName}/[^/]+/${articleRootName}/(?:${assetsName}$|${assetsName}/)`)
    if (!reg.test(dirPath)) {
      // 祖先に記事ディレクトリが存在することを確認
      const parentPath = removeStartDirChars(_path.dirname(dirPath))
      let nearestArticleDirType: StorageArticleDirType | undefined = undefined
      for (let i = ancestorDirNodes.length - 1; i >= 0; i--) {
        const ancestorNode = ancestorDirNodes[i]
        const articleDirType = ancestorNode?.article?.dir?.type
        if (articleDirType) {
          nearestArticleDirType = articleDirType
          break
        }
      }
      if (nearestArticleDirType !== 'Article') {
        throw new AppError(`The specified path is not under article: '${dirPath}'`)
      }
    }

    const dirNode = hierarchicalDirNodeDict[dirPath]
    // 引数ディレクトリがまだ存在しない場合
    if (!dirNode.exists) {
      // ディレクトリを作成
      const id = StorageSchema.generateNodeId()
      const now = dayjs().toISOString()
      await this.client.update({
        index: StorageSchema.IndexAlias,
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
      // データベースに追加された最新ディレクトリを取得
      return await this.sgetNode({ id })
    }
    // 引数ディレクトリが既に存在する場合
    else {
      if (options?.share) {
        return await this.setDirShareDetail({ path: dirPath }, options.share)
      } else {
        return await this.sgetNode({ path: dirPath })
      }
    }
  }

  protected async createOtherArticleGeneralDir(dirPath: string, options?: CreateStorageNodeOptions): Promise<StorageNode> {
    throw new AppError(`Not implemented yet.`)
  }

  /**
   * 記事系ディレクトリの名前変更を行います。
   * @param idToken
   * @param dirPath
   * @param newName
   */
  renameArticleDir(idToken: IdToken, dirPath: string, newName: string): Promise<StorageNode>

  /**
   * @see renameArticleDir
   * @param dirPath
   * @param newName
   */
  renameArticleDir(dirPath: string, newName: string): Promise<StorageNode>

  async renameArticleDir(arg1: IdToken | string, arg2: string, arg3?: string): Promise<StorageNode> {
    let idToken: IdToken | undefined
    let dirPath: string
    let newName: string
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      dirPath = arg2
      newName = arg3 as string
    } else {
      dirPath = arg1
      newName = arg2
    }

    if (idToken) {
      await this.validateBrowsable(idToken, dirPath)

      if (CoreStorageService.isOwnUserRootUnder(idToken, dirPath) || idToken.isAppAdmin) {
        return this.renameOwnArticleDir(dirPath, newName)
      } else {
        return this.renameOtherArticleDir(dirPath, newName)
      }
    } else {
      return this.renameOwnArticleDir(dirPath, newName)
    }
  }

  protected async renameOwnArticleDir(dirPath: string, newName: string): Promise<StorageNode> {
    dirPath = removeBothEndsSlash(dirPath)
    StorageService.validateNodeName(newName)

    // 引数ディレクトリのパスが実際にディレクトリか検証
    const dirNode = await this.sgetNode({ path: dirPath })
    if (dirNode.nodeType !== 'Dir') {
      throw new AppError(`The specified path is not a directory.`, { specifiedPath: dirPath })
    }

    // 引数ディレクトリのパスが記事ルート配下のものか検証
    this.m_validateArticleRootUnder(dirPath)

    await this.client.update({
      index: StorageSchema.IndexAlias,
      id: dirNode.id,
      body: {
        doc: {
          article: {
            dir: {
              name: newName,
            },
          },
          version: dirNode.version + 1,
        },
      },
      refresh: true,
    })

    return this.sgetNode({ id: dirNode.id })
  }

  async renameOtherArticleDir(dirPath: string, newName: string): Promise<StorageNode> {
    throw new AppError(`Not implemented yet.`)
  }

  /**
   * 指定されたノードパスのノードにソート順を設定します。
   * @param idToken
   * @param orderNodePaths
   *   ソート順を設定するノードパスを順番に指定します。指定するノードはみな同じ親の子でなければ
   *   なりません。指定された配列の最後尾ノードのソート順には「1」が設定され、ここから先頭に向か
   *   ってソート順の値がインクリメントされます。
   */
  async setArticleSortOrder(idToken: IdToken, orderNodePaths: string[]): Promise<void> {
    if (idToken) {
      await this.validateBrowsable(idToken, orderNodePaths)

      if (CoreStorageService.isOwnUserRootUnder(idToken, orderNodePaths[0]) || idToken.isAppAdmin) {
        return this.setOwnArticleSortOrder(idToken, orderNodePaths)
      } else {
        return this.setOtherArticleSortOrder(idToken, orderNodePaths)
      }
    } else {
      return this.setOwnArticleSortOrder(idToken, orderNodePaths)
    }
  }

  protected async setOwnArticleSortOrder(idToken: { uid: string }, orderNodePaths: string[]): Promise<void> {
    if (!orderNodePaths.length) return

    // 指定されたパスのバリデーションチェック
    orderNodePaths.forEach(nodePath => StorageService.validateNodePath(nodePath))
    orderNodePaths = orderNodePaths.map(nodePath => removeBothEndsSlash(nodePath))

    // 引数ノードリストの親がみな一緒か検証
    const parentPath = _path.dirname(orderNodePaths[0])
    orderNodePaths.forEach(nodePath => {
      if (parentPath !== _path.dirname(nodePath)) {
        throw new AppError(`There are multiple parents in 'orderNodePaths'.`, { orderNodePaths })
      }
    })

    // 親ディレクトリを取得
    const parentNode = await this.sgetNode({ path: parentPath })
    const parentArticleDirType = parentNode.article?.dir?.type

    // 親ディレクトリが「記事ルート、リストバンドル、ツリーバンドル、カテゴリ」以外の場合、
    // 子ノードにソート順を設定することはできない。
    if (
      !(
        parentNode.path === StorageService.toArticleRootPath(idToken) ||
        parentArticleDirType === 'ListBundle' ||
        parentArticleDirType === 'TreeBundle' ||
        parentArticleDirType === 'Category'
      )
    ) {
      throw new AppError(`It is not possible to set the sort order for child nodes.`, {
        parent: pickProps(parentNode, ['id', 'path', 'article']),
      })
    }

    // 引数ノードリストの親が持つ子ノードの数と引数ノードリストが一致するか検証
    const countResponse = await this.client.count({
      index: StorageSchema.IndexAlias,
      body: {
        query: {
          bool: {
            must: [{ term: { dir: parentPath } }],
            // ソート順を設定できるのは記事系ディレクトリのみなのでフィルターする
            filter: [{ exists: { field: 'article.dir' } }],
          },
        },
      },
    })
    const childCount = countResponse.body.count
    if (orderNodePaths.length !== childCount) {
      throw new AppError(`The number of 'orderNodePaths' does not match the number of children of the parent of 'orderNodePaths'.`, {
        orderNodePaths,
      })
    }

    //
    // 引数ノードリストにソート順を設定
    //
    let currentSortOrder = orderNodePaths.length
    const params = orderNodePaths.reduce((result, nodePath, index) => {
      result[nodePath] = currentSortOrder--
      return result
    }, {} as { [nodePath: string]: number })

    await this.client.updateByQuery({
      index: StorageSchema.IndexAlias,
      body: {
        query: { term: { dir: parentNode.path } },
        script: {
          lang: 'painless',
          source: `
            if (ctx._source.article != null && ctx._source.article.dir != null) {
              ctx._source.article.dir.sortOrder = params[ctx._source.path]
            }
          `,
          params,
        },
      },
      refresh: true,
    })
  }

  protected async setOtherArticleSortOrder(idToken: IdToken, orderNodePaths: string[]): Promise<void> {
    throw new AppError(`Not implemented yet.`)
  }

  /**
   * 記事本文を保存します。
   * @param idToken
   * @param articleDirPath
   * @param srcContent
   * @param textContent
   */
  saveArticleMasterSrcFile(idToken: IdToken, articleDirPath: string, srcContent: string, textContent: string): Promise<SaveArticleMasterSrcFileResult>

  /**
   * @see saveArticleMasterSrcFile
   * @param articleDirPath
   * @param srcContent
   * @param textContent
   */
  saveArticleMasterSrcFile(articleDirPath: string, srcContent: string, textContent: string): Promise<SaveArticleMasterSrcFileResult>

  async saveArticleMasterSrcFile(arg1: IdToken | string, arg2: string, arg3: string, arg4?: string): Promise<SaveArticleMasterSrcFileResult> {
    let idToken: IdToken | undefined
    let articleDirPath: string
    let srcContent: string
    let textContent: string
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      articleDirPath = arg2
      srcContent = arg3
      textContent = arg4 as string
    } else {
      articleDirPath = arg1
      srcContent = arg2
      textContent = arg3
    }

    if (idToken) {
      await this.validateBrowsable(idToken, articleDirPath)

      if (CoreStorageService.isOwnUserRootUnder(idToken, articleDirPath) || idToken.isAppAdmin) {
        return this.saveOwnArticleMasterSrcFile(articleDirPath, srcContent, textContent)
      } else {
        return this.saveOtherArticleMasterSrcFile(articleDirPath, srcContent, textContent)
      }
    } else {
      return this.saveOwnArticleMasterSrcFile(articleDirPath, srcContent, textContent)
    }
  }

  protected async saveOwnArticleMasterSrcFile(
    articleDirPath: string,
    srcContent: string,
    textContent: string
  ): Promise<SaveArticleMasterSrcFileResult> {
    let { master: masterNode, draft: draftNode } = await this.getArticleSrcFiles(articleDirPath)

    masterNode = await this.saveGCSFileAndFileNode(masterNode.path, srcContent)
    draftNode = await this.saveGCSFileAndFileNode(draftNode.path, '', undefined, {
      timestamp: {
        updatedAt: masterNode.updatedAt, // 更新日を本文に合わせる
      },
    })

    // 全文検索用のテキストコンテンツを設定
    await this.client.update({
      index: StorageSchema.IndexAlias,
      id: masterNode.id,
      body: {
        doc: {
          article: {
            src: {
              textContent,
            },
          },
        },
      },
      refresh: true,
    })
    masterNode = await this.sgetNode(masterNode)

    return { master: masterNode, draft: draftNode }
  }

  protected async saveOtherArticleMasterSrcFile(
    articleDirPath: string,
    srcContent: string,
    textContent: string
  ): Promise<SaveArticleMasterSrcFileResult> {
    throw new AppError(`Not implemented yet.`)
  }

  /**
   * 記事下書きを保存します。
   * @param idToken
   * @param articleDirPath
   * @param srcContent
   */
  saveArticleDraftSrcFile(idToken: IdToken, articleDirPath: string, srcContent: string | null): Promise<StorageNode>

  /**
   * @see saveArticleDraftSrcFile
   * @param articleDirPath
   * @param srcContent
   */
  saveArticleDraftSrcFile(articleDirPath: string, srcContent: string | null): Promise<StorageNode>

  async saveArticleDraftSrcFile(arg1: IdToken | string, arg2: string | null, arg3?: string | null): Promise<StorageNode> {
    let idToken: IdToken | undefined
    let articleDirPath: string
    let srcContent: string | null
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      articleDirPath = arg2 as string
      srcContent = arg3 as string | null
    } else {
      articleDirPath = arg1
      srcContent = arg2
    }

    if (idToken) {
      await this.validateBrowsable(idToken, articleDirPath)

      if (CoreStorageService.isOwnUserRootUnder(idToken, articleDirPath) || idToken.isAppAdmin) {
        return this.saveOwnArticleDraftSrcFile(articleDirPath, srcContent)
      } else {
        return this.saveOtherArticleDraftSrcFile(articleDirPath, srcContent)
      }
    } else {
      return this.saveOwnArticleDraftSrcFile(articleDirPath, srcContent)
    }
  }

  async saveOwnArticleDraftSrcFile(articleDirPath: string, srcContent: string | null): Promise<StorageNode> {
    const draftNodePath = StorageService.toArticleSrcDraftPath(articleDirPath)

    // 下書き破棄が指定されていた場合
    if (srcContent === null) {
      const { master } = await this.getArticleSrcFiles(articleDirPath)
      return this.saveGCSFileAndFileNode(draftNodePath, srcContent, undefined, {
        timestamp: {
          updatedAt: master.updatedAt, // 更新日を本文に合わせる
        },
      })
    }
    // 下書きコンテンツが指定されていた場合
    else {
      return this.saveGCSFileAndFileNode(draftNodePath, srcContent)
    }
  }

  async saveOtherArticleDraftSrcFile(articleDirPath: string, srcContent: string | null): Promise<StorageNode> {
    throw new AppError(`Not implemented yet.`)
  }

  /**
   * 指定されたディレクトリ直下の記事系ノードを取得します。
   *
   * 引数が次のように指定された場合、
   *   + dirPath: 'users/taro/articles/programing'
   *
   * 次のようなノードが取得されます。
   *   + 'users/taro/articles/programing/js'
   *   + 'users/taro/articles/programing/ts'
   *
   * @param input
   * @param pagination
   */
  async getArticleChildren(input: GetArticleChildrenInput, pagination?: StoragePaginationInput): Promise<StoragePaginationResult<StorageNode>> {
    const dirPath = removeBothEndsSlash(input.dirPath)
    const maxChunk = pagination?.maxChunk || StorageService.MaxChunk
    const from = pagination?.pageToken ? Number(pagination.pageToken) : 0

    const response = await this.client.search<ElasticSearchResponse<DBStorageNode>>({
      index: StorageSchema.IndexAlias,
      size: maxChunk,
      from,
      body: {
        query: {
          bool: {
            must: [{ term: { dir: dirPath } }, { terms: { 'article.dir.type': input.types } }],
          },
        },
        sort: [{ 'article.dir.sortOrder': 'desc' }],
      },
      _source_includes: this.includeNodeFields,
      _source_excludes: this.excludeNodeFields,
    })
    const nodes = this.dbResponseToNodes(response)

    let nextPageToken: string | undefined
    if (nodes.length === 0 || nodes.length < maxChunk) {
      nextPageToken = undefined
    } else {
      nextPageToken = String(from + nodes.length)
    }

    return { nextPageToken, list: nodes }
  }

  /**
   * 記事の目次を取得します。
   * - ツリーバンドル配下のカテゴリと記事は目次として取得されます。
   * - リストバンドル配下の記事は目次として取得されません。
   * @param userName
   * @param requester
   */
  async getArticleTableOfContents(userName: string, requester?: { uid: string }): Promise<ArticleTableOfContentsNode[]> {
    // ユーザー名をキーにしてユーザーを取得
    const user = await this.userHelper.getUser({ userName })
    if (!user) {
      throw new AppError(`The user with the specified 'userName' does not exist.`, { userName })
    }
    // ユーザーの記事ルートとその祖先ノードを取得
    const articleRootPath = StorageService.toArticleRootPath({ uid: user.id })

    /**
     * ユーザーの記事ルート配下のノードか否かを判定する関数です。
     * @param path
     */
    const isArticleRootUnder = (path: string) => path.startsWith(`${articleRootPath}/`)

    /**
     * 指定されたノードとノードの階層構造を形成するディレクトリを取得する関数です。
     * @param nodeMap
     * @param nodePath
     */
    const getHierarchicalNodes = (nodeMap: Record<string, StorageNode>, nodePath: string) => {
      const hierarchicalPaths = splitHierarchicalPaths(nodePath)
      return hierarchicalPaths.reduce<StorageNode[]>((result, path) => {
        isArticleRootUnder(path) && result.push(nodeMap[path]!)
        return result
      }, [])
    }

    /**
     * 指定されたノードを目次ノードに変換します。
     * @param nodes
     */
    const toArticleTableOfContentsNodes = (nodes: StorageNode[]) => {
      StorageService.sortNodes(nodes)
      return nodes.map(node => {
        const result: ArticleTableOfContentsNode = {
          ...pickProps(node, ['id', 'name', 'version', 'createdAt', 'updatedAt']),
          dir: removeBothEndsSlash(node.dir.replace(articleRootPath, '')),
          path: removeBothEndsSlash(node.path.replace(articleRootPath, '')),
          label: node.article!.dir!.name,
          type: node.article!.dir!.type,
        }
        return result
      })
    }

    //
    // バンドルディレクトリのみを取得
    //
    const response1 = await this.client.search<ElasticSearchResponse<DBStorageNode>>({
      index: StorageSchema.IndexAlias,
      size: 10000,
      body: {
        query: {
          bool: {
            must: [
              { term: { dir: articleRootPath } },
              {
                terms: { 'article.dir.type': ['ListBundle', 'TreeBundle'] },
              },
            ],
          },
        },
      },
      _source_includes: this.includeNodeFields,
      _source_excludes: this.excludeNodeFields,
    })
    const bundleDirs = this.dbResponseToNodes(response1)

    //
    // バンドルディレクトリ配下の「カテゴリディレクトリ」「記事ディレクトリ」を取得
    // ・ツリーバンドル配下のカテゴリディレクトリ、記事ディレクトリは全て取得する
    // ・リストバンドル配下の記事ディレクトリは取得しない
    //
    const queryBody: string[] = []
    for (const bundleNode of bundleDirs) {
      if (bundleNode.article?.dir?.type === 'ListBundle') continue
      const header = { index: StorageSchema.IndexAlias }
      const body = {
        size: 10000,
        query: {
          bool: {
            must: [
              { wildcard: { path: `${bundleNode.path}/*` } },
              {
                terms: { 'article.dir.type': ['Category', 'Article'] },
              },
            ],
          },
        },
        _source: {
          includes: this.includeNodeFields,
          excludes: this.excludeNodeFields,
        },
      }
      queryBody.push(JSON.stringify(header))
      queryBody.push(JSON.stringify(body))
    }

    // バンドルディレクトリ配下に記事系ディレクトリがない場合、ここまでの検索結果を返す
    if (!queryBody.length) {
      return toArticleTableOfContentsNodes(bundleDirs)
    }

    const response2 = await this.client.msearch<ElasticMSearchResponse<DBStorageNode>, string[]>({
      body: queryBody,
    })
    const bundleUnderDirs = this.dbResponseToNodes(response2)
    const allNodeMap = [...bundleDirs, ...bundleUnderDirs].reduce<{ [path: string]: StorageNode }>((result, node) => {
      result[node.path] = node
      return result
    }, {})

    // リクエスターが自身の場合、検索結果の全てを返す
    if (user.id === requester?.uid) {
      return toArticleTableOfContentsNodes(Object.values(allNodeMap))
    }

    //
    // リクエスターがアクセス可能な記事ディレクトリに絞り込み
    //
    const accessibleArticleDirs = bundleUnderDirs.filter(node => {
      if (node.article?.dir?.type !== 'Article') return false
      const hierarchicalNodes = getHierarchicalNodes(allNodeMap, node.path)
      const share = this.getInheritedShareDetail(hierarchicalNodes)
      if (requester) {
        return share.isPublic || share.readUIds?.includes(requester.uid)
      } else {
        return share.isPublic
      }
    })

    //
    // 取得した記事ディレクトリを階層構造化
    //
    const accessibleDirNodes = [...bundleDirs.filter(node => node.article?.dir?.type === 'ListBundle'), ...accessibleArticleDirs]
    const summarizedPaths = summarizeFamilyPaths(accessibleDirNodes.map(node => node.path))
    const allAccessiblePaths = splitHierarchicalPaths(...summarizedPaths).filter(isArticleRootUnder)
    const allAccessibleNodes = allAccessiblePaths.map(path => allNodeMap[path])

    return toArticleTableOfContentsNodes(allAccessibleNodes)
  }

  /**
   * クライアントから指定された記事のソースファイルをサーブします。
   * @param req
   * @param res
   * @param articleId
   */
  async serveArticle(req: Request, res: Response, articleId: string): Promise<Response> {
    const articleDirNode = await this.getNode({ id: articleId })
    if (!articleDirNode) {
      return res.sendStatus(404)
    }

    const articleFilePath = StorageService.toArticleSrcMasterPath(articleDirNode.path)
    return this.serveFile(req, res, { path: articleFilePath })
  }

  //--------------------------------------------------
  //  Overridden
  //--------------------------------------------------

  protected async createOwnDir(dirPath: string, input?: CreateStorageNodeOptions): Promise<StorageNode> {
    // このメソッドでは記事ルート配下にディレクトリを作成できない。
    // 例: 'users/xxx/articles'配下にディレクトリを作成できない。
    if (StorageService.isArticleRootUnder(dirPath)) {
      throw new AppError(`This method 'createDir()' cannot create an article under directory '${dirPath}'.`)
    }

    return super.createOwnDir(dirPath, input)
  }

  protected async createOwnHierarchicalDirs(dirPaths: string[]): Promise<StorageNode[]> {
    // このメソッドでは記事ルート配下にディレクトリを作成できない。
    // 例: 'users/xxx/articles'配下にディレクトリを作成できない。
    for (const dirPath of splitHierarchicalPaths(...dirPaths)) {
      if (StorageService.isArticleRootUnder(dirPath)) {
        throw new AppError(`This method 'createHierarchicalDirs()' cannot create an article under directory '${dirPath}'.`)
      }
    }

    return super.createOwnHierarchicalDirs(dirPaths)
  }

  protected async moveOwnDir(fromDirPath: string, toDirPath: string, input?: { maxChunk?: number }): Promise<void> {
    fromDirPath = removeBothEndsSlash(fromDirPath)
    toDirPath = removeBothEndsSlash(toDirPath)

    StorageService.validateNodePath(toDirPath)

    const fromDirNode = await this.sgetNode({ path: fromDirPath })
    const fromArticleDirType = fromDirNode.article?.dir?.type
    switch (fromDirNode.article?.dir?.type) {
      // 移動ノードがバンドルの場合
      // ※バンドルは移動不可
      case 'ListBundle':
      case 'TreeBundle': {
        throw new AppError('Article bundles cannot be moved.', {
          movingNode: pickProps(fromDirNode, ['id', 'path', 'article']),
        })
      }
      // 移動ノードが｢カテゴリ｣の場合
      // ※カテゴリは｢ツリーバンドル、カテゴリ｣へのみ移動可能
      case 'Category': {
        const toParentNode = await this.sgetNode({ path: _path.dirname(toDirPath) })
        const toParentArticleDirType = toParentNode.article?.dir?.type
        // カテゴリは｢ツリーバンドル、カテゴリ｣へのみ移動可能。それ以外へは移動不可
        if (!(toParentArticleDirType === 'TreeBundle' || toParentArticleDirType === 'Category')) {
          throw new AppError('Categories can only be moved to category bundles or categories.', {
            movingNode: pickProps(fromDirNode, ['id', 'path', 'article']),
            toParentNode: pickProps(toParentNode, ['id', 'path', 'article']),
          })
        }
        break
      }
      // 移動ノードが記事ディレクトリの場合
      // ※記事ディレクトリは｢リストバンドル、ツリーバンドル、カテゴリ｣へのみ移動可能
      case 'Article': {
        const toParentNode = await this.sgetNode({ path: _path.dirname(toDirPath) })
        const toParentArticleDirType = toParentNode.article?.dir?.type
        if (!(toParentArticleDirType === 'ListBundle' || toParentArticleDirType === 'TreeBundle' || toParentArticleDirType === 'Category')) {
          throw new AppError('Articles can only be moved to list bundles or category bundles or categories.', {
            movingNode: pickProps(fromDirNode, ['id', 'path', 'article']),
            toParentNode: pickProps(toParentNode, ['id', 'path', 'article']),
          })
        }
        break
      }
      // 移動ノードが｢一般ディレクトリ｣の場合
      // ※一般ディレクトリは｢一般ディレクトリ、記事ディレクトリ｣へのみ移動可能
      default: {
        const toParentPath = removeStartDirChars(_path.dirname(toDirPath))
        // 移動先がルートノード以外の場合
        if (toParentPath) {
          const toParentNode = await this.sgetNode({ path: toParentPath })
          const toParentArticleDirType = toParentNode.article?.dir?.type
          // 移動先が｢一般ディレクトリ、記事ディレクトリ｣以外の場合
          if (!(!toParentArticleDirType || toParentArticleDirType === 'Article')) {
            throw new AppError('The general directory can only be moved to the general directory or articles.', {
              movingNode: pickProps(fromDirNode, ['id', 'path', 'article']),
              toParentNode: pickProps(toParentNode, ['id', 'path', 'article']),
            })
          }
        }
        break
      }
    }

    //
    // ディレクトリの移動を実行
    //
    await super.moveOwnDir(fromDirPath, toDirPath, input)

    //
    // 移動ディレクトリにソート順を設定
    //
    // 移動ディレクトリが｢カテゴリディレクトリ、記事ディレクトリ｣の場合
    // ※1 バンドルは移動できないので対象外
    // ※2 記事系ディレクトリ以外のディレクトリにソート順は設定されないので対象外
    if (fromArticleDirType === 'Category' || fromArticleDirType === 'Article') {
      const sortOrder = await this.m_getNewArticleSortOrder({ path: toDirPath })
      await this.client.update({
        index: StorageSchema.IndexAlias,
        id: fromDirNode.id,
        body: {
          doc: {
            article: {
              dir: {
                sortOrder,
              },
            },
          },
        },
        refresh: true,
      })
    }
  }

  protected dbResponseToNodes(dbResponse: ElasticSearchAPIResponse<DBStorageNode> | ElasticMSearchAPIResponse<DBStorageNode>): StorageNode[] {
    return StorageSchema.dbResponseToAppEntities(dbResponse)
  }

  protected toStorageNode(dbNode: DBStorageNode): StorageNode {
    return StorageSchema.toAppEntity(dbNode)
  }

  protected toDBStorageNode(node: StorageNode): DBStorageNode {
    return StorageSchema.toDBEntity(node)
  }

  protected toBaseDBStorageNode(
    input: { id: string; nodeType: StorageNodeType; path: string; share?: SetShareDetailInput | null },
    existing?: StorageNode
  ): DBStorageNode {
    const result: DBStorageNode = { ...super.toBaseDBStorageNode(input, existing) }
    if (existing?.article?.dir) {
      result.article = {
        dir: {
          name: existing.article.dir.name,
          type: existing.article.dir.type,
          sortOrder: existing.article.dir.sortOrder,
        },
      }
    } else if (existing?.article?.src) {
      result.article = {
        src: {
          type: existing.article.src.type,
        },
      }
    }
    return result
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  //--------------------------------------------------
  //  Article
  //--------------------------------------------------

  /**
   * バンドルを作成します。
   * @param input
   * @param options
   */
  private async m_createArticleBundle(
    input: RequiredAre<CreateArticleTypeDirInput, 'sortOrder'>,
    options?: CreateStorageNodeOptions
  ): Promise<StorageNode> {
    StorageService.validateNodePath(input.dir)
    StorageService.validateArticleDirName(input.name)
    const parentPath = removeBothEndsSlash(input.dir)

    // 指定されたディレクトリパスが記事ルート直下であることを検証
    const userRootName = config.storage.user.rootName
    const articleRootName = config.storage.article.rootName
    const reg = new RegExp(`${userRootName}/[^/]+/${articleRootName}$`)
    if (!reg.test(parentPath)) {
      throw new AppError(`The article bundle must be created directly under the article root.`, {
        input: pickProps(input, ['dir', 'name', 'type']),
      })
    }

    // バンドルを作成
    const dirPath = _path.join(input.dir, StorageSchema.generateNodeId())
    return this.m_createArticleTypeDir(dirPath, input, options)
  }

  /**
   * カテゴリディレクトリを作成します。
   * @param input
   * @param options
   */
  private async m_createArticleCategory(
    input: RequiredAre<CreateArticleTypeDirInput, 'sortOrder'>,
    options?: CreateStorageNodeOptions
  ): Promise<StorageNode> {
    StorageService.validateNodePath(input.dir)
    StorageService.validateArticleDirName(input.name)
    const parentPath = removeBothEndsSlash(input.dir)

    // 親ディレクトリが｢ツリーバンドル、カテゴリ｣以外の場合、
    // カテゴリの作成はできないためエラー
    const parentNode = await this.getNode({ path: parentPath })
    const parentArticleDirType = parentNode?.article?.dir?.type
    if (!parentNode) {
      throw new AppError(`There is no parent directory for the category to be created.`, { parentPath })
    }
    if (!(parentArticleDirType === 'TreeBundle' || parentArticleDirType === 'Category')) {
      throw new AppError(`Categories cannot be created under the specified parent.`, {
        parentNode: pickProps(parentNode, ['id', 'path', 'article']),
      })
    }

    // カテゴリを作成
    const dirPath = _path.join(input.dir, StorageSchema.generateNodeId())
    return this.m_createArticleTypeDir(
      dirPath,
      {
        ...input,
        type: 'Category',
      },
      options
    )
  }

  /**
   * 記事ディレクトリを作成します。
   * ※記事ディレクトリには記事に必要なファイルが格納されることになります。
   * @param input
   * @param options
   */
  private async m_createArticle(
    input: RequiredAre<CreateArticleTypeDirInput, 'sortOrder'>,
    options?: CreateStorageNodeOptions
  ): Promise<StorageNode> {
    StorageService.validateArticleDirName(input.name)
    const dirPath = _path.join(input.dir, StorageSchema.generateNodeId())
    const parentPath = removeBothEndsSlash(input.dir)

    // 引数ディレクトリの階層構造形成に必要なノードを取得
    const hierarchicalDirNodes = await this.getRequiredHierarchicalDirNodes(dirPath)
    const hierarchicalDirNodeDict = arrayToDict(hierarchicalDirNodes, 'path')

    // 親ディレクトリが｢リストバンドル、ツリーバンドル、カテゴリ｣以外の場合、
    // カテゴリの作成はできないためエラー
    const parentNode = hierarchicalDirNodeDict[parentPath]
    const parentArticleDirType = parentNode.article?.dir?.type
    if (!parentNode.exists) {
      throw new AppError(`There is no parent directory for the article to be created.`, { parentPath })
    }
    if (!(parentArticleDirType === 'ListBundle' || parentArticleDirType === 'TreeBundle' || parentArticleDirType === 'Category')) {
      throw new AppError(`Articles cannot be created under the specified parent.`, {
        parentNode: pickProps(parentNode, ['id', 'path', 'article']),
      })
    }

    // 祖先に記事ディレクトリが存在しないことをチェック
    for (const iDirNode of hierarchicalDirNodes.filter(node => node.path !== dirPath)) {
      if (iDirNode.article?.dir?.type === 'Article') {
        throw new AppError(`The article cannot be created under article.`, {
          specifiedDirPath: dirPath,
          ancestorDirPath: iDirNode.path,
        })
      }
    }

    // 記事ディレクトリを作成
    const result = await this.m_createArticleTypeDir(
      hierarchicalDirNodes,
      {
        ...input,
        type: 'Article',
      },
      options
    )

    // 記事ディレクトリに記事ソースと下書きファイルを配置
    const masterFileItem = {
      path: _path.join(dirPath, config.storage.article.masterSrcFileName),
      article: {
        src: {
          type: 'Master',
        },
      } as StorageArticleDetail,
      share: undefined as SetShareDetailInput | undefined,
    }
    const draftFileItem = {
      path: _path.join(dirPath, config.storage.article.draftSrcFileName),
      article: {
        src: {
          type: 'Draft',
        },
      } as StorageArticleDetail,
      share: { isPublic: false } as SetShareDetailInput,
    }
    await Promise.all(
      [masterFileItem, draftFileItem].map(async ({ path, article, share }) => {
        const fileNode = await this.saveGCSFileAndFileNode(path, '', { contentType: 'text/markdown' }, { share })
        await this.client.update({
          index: StorageSchema.IndexAlias,
          id: fileNode.id,
          body: {
            doc: {
              article,
            },
          },
          refresh: true,
        })
      })
    )

    return result
  }

  /**
   * 記事ルート配下にディレクトリを作成します。
   * @param dirPath
   * @param input
   * @param options
   */
  private async m_createArticleTypeDir(
    dirPath: string,
    input: {
      name: string
      type: StorageArticleDirType
      sortOrder: number
    },
    options?: CreateStorageNodeOptions
  ): Promise<StorageNode>

  /**
   * 記事ルート配下に記事系ディレクトリを作成します。
   * @param hierarchicalDirNodes
   * @param input
   * @param options
   */
  private async m_createArticleTypeDir(
    hierarchicalDirNodes: (StorageNode & { exists: boolean })[],
    input: {
      name: string
      type: StorageArticleDirType
      sortOrder: number
    },
    options?: CreateStorageNodeOptions
  ): Promise<StorageNode>

  private async m_createArticleTypeDir(
    dirPath_or_hierarchicalDirNodes: string | (StorageNode & { exists: boolean })[],
    input: {
      name: string
      type: StorageArticleDirType
      sortOrder: number
    },
    options?: CreateStorageNodeOptions
  ): Promise<StorageNode> {
    // 作成するディレクトリのパスと、その階層構造を形成するのに必要なノードを取得
    let dirPath: string
    let hierarchicalDirNodes: (StorageNode & { exists: boolean })[]
    if (typeof dirPath_or_hierarchicalDirNodes === 'string') {
      // 指定パスのバリデーションチェック
      dirPath = dirPath_or_hierarchicalDirNodes
      StorageService.validateNodePath(dirPath)
      dirPath = removeBothEndsSlash(dirPath)
      // 引数パスが記事ルート配下のものか検証
      this.m_validateArticleRootUnder(dirPath)
      // 引数パスの階層構造形成に必要なノードを取得
      hierarchicalDirNodes = await this.getRequiredHierarchicalDirNodes(dirPath)
    } else {
      hierarchicalDirNodes = dirPath_or_hierarchicalDirNodes
      dirPath = hierarchicalDirNodes[hierarchicalDirNodes.length - 1].path
      // 引数パスが記事ルート配下のものか検証
      this.m_validateArticleRootUnder(dirPath)
    }

    const hierarchicalDirNodeDict = arrayToDict(hierarchicalDirNodes, 'path')
    const ancestorDirNodes = hierarchicalDirNodes.filter(node => node.path !== dirPath)

    // 作成しようとするディレクトリが存在しないことを検証
    const dirNode = hierarchicalDirNodeDict[dirPath]
    if (dirNode.exists) {
      throw new AppError(`The specified directory already exists: '${dirPath}'`)
    }

    for (const iDirNode of ancestorDirNodes) {
      // 作成しようとするディレクトリの祖先が存在することを検証
      if (!iDirNode.exists) {
        throw new AppError(`The ancestor of the specified path does not exist.`, {
          specifiedPath: dirPath,
          ancestorPath: iDirNode.path,
        })
      }
    }

    // ディレクトリを作成
    const id = dirNode.name
    const now = dayjs().toISOString()
    await this.client.update({
      index: StorageSchema.IndexAlias,
      id,
      body: {
        doc: {
          ...this.toDBStorageNode(dirNode),
          id,
          share: this.toDBShareDetail(options?.share),
          version: 1,
          createdAt: now,
          updatedAt: now,
          article: {
            dir: pickProps(input, ['name', 'type', 'sortOrder']),
          },
        },
        doc_as_upsert: true,
      },
      refresh: true,
    })

    // 追加された最新ディレクトリを取得
    return await this.sgetNode({ id })
  }

  /**
   * 指定されたパスが記事ルート配下のノードであることを検証します。
   * @param nodePath
   */
  protected m_validateArticleRootUnder(nodePath: string): void {
    nodePath = removeBothEndsSlash(nodePath)
    const userRootName = config.storage.user.rootName
    const articleRootName = config.storage.article.rootName

    // 引数パスが記事ルート配下にあることを検証
    const reg = new RegExp(`^${userRootName}/[^/]+/${articleRootName}/`)
    if (!reg.test(nodePath)) {
      throw new AppError(`The specified path is not under article root: '${nodePath}'`)
    }
  }

  /**
   * 指定されたパスが所属するバンドルを取得します。
   * @param nodePath
   */
  protected async m_getBelongToArticleBundle(nodePath: string): Promise<StorageNode | undefined> {
    nodePath = removeBothEndsSlash(nodePath)
    const userRootName = config.storage.user.rootName
    const articleRootName = config.storage.article.rootName

    // 引数パスからバンドルのパスを取得
    const reg = new RegExp(`(?<bundlePath>^${userRootName}/[^/]+/${articleRootName}/[^/]+)/`)
    const regResult = reg.exec(nodePath)
    const bundlePath = regResult?.groups?.bundlePath
    if (!bundlePath) {
      return undefined
    }

    // 上記で取得したパスからバンドルを取得
    const bundle = await this.getNode({ path: bundlePath })
    const bundleArticleDirTyp = bundle?.article?.dir?.type
    if (!bundle) return undefined
    if (!(bundleArticleDirTyp === 'ListBundle' || bundleArticleDirTyp === 'TreeBundle')) {
      return undefined
    }

    return bundle
  }

  /**
   * 指定されたノードの親ディレクトリ直下ノードの中で最大のソート順を取得し、「+1」した値を返します。
   * @param input
   */
  async m_getNewArticleSortOrder(input: StorageNodeGetKeyInput): Promise<number> {
    if (!input.id && !input.path) {
      throw new AppError(`Either the 'id' or the 'path' must be specified.`)
    }

    let nodePath: string
    let parentPath: string
    if (input.id) {
      const node = await this.sgetNode({ id: input.id })
      nodePath = node.path
      parentPath = node.dir
    } else {
      nodePath = removeBothEndsSlash(input.path)
      parentPath = _path.dirname(nodePath)
    }

    const res = await this.client.search({
      index: StorageSchema.IndexAlias,
      size: 0,
      body: {
        query: {
          bool: {
            must: [
              { term: { dir: parentPath } },
              {
                bool: { must_not: [{ term: { path: nodePath } }] },
              },
            ],
          },
        },
        aggs: {
          maxArticleSortOrder: {
            max: { field: 'article.dir.sortOrder' },
          },
        },
      },
      _source: false as any,
    })
    return parseInt(res.body.aggregations.maxArticleSortOrder.value + 1)
  }

  /**
   * 指定されたディレクトリ直下のノードの中で、最大のソート順を取得します。
   * @param dirKey
   */
  async m_getMaxArticleSortOrder(dirKey: StorageNodeGetKeyInput): Promise<number> {
    if (!dirKey.id && !dirKey.path) {
      throw new AppError(`Either the 'id' or the 'path' must be specified.`)
    }

    let dirPath: string
    if (dirKey.id) {
      const dirNode = await this.sgetNode({ id: dirKey.id })
      if (dirNode.nodeType !== 'Dir') {
        throw new AppError(`The specified node is not a directory.`, { input: dirKey })
      }
      dirPath = dirNode.path
    } else {
      dirPath = removeBothEndsSlash(dirKey.path)
    }

    const res = await this.client.search({
      index: StorageSchema.IndexAlias,
      size: 0,
      body: {
        query: {
          term: { dir: dirPath },
        },
        aggs: {
          maxArticleSortOrder: {
            max: { field: 'article.dir.sortOrder' },
          },
        },
      },
      _source: false as any,
    })
    return parseInt(res.body.aggregations.maxArticleSortOrder.value) || 0
  }

  //----------------------------------------------------------------------
  //
  //  Static
  //
  //----------------------------------------------------------------------

  /**
   * ユーザーの記事ルートのパスを取得します。
   * @param user
   */
  static toArticleRootPath(user: { uid: string }): string {
    return _path.join(this.toUserRootPath(user), config.storage.article.rootName)
  }

  /**
   * 記事用のアッセトディレクトリのパスを取得します。
   * @param user
   */
  static toArticleAssetsPath(user: { uid: string }): string {
    return _path.join(this.toArticleRootPath(user), config.storage.article.assetsName)
  }

  /**
   * 記事の本文ファイルパスを取得します。
   * @param articleDirPath 記事ディレクトリパス
   */
  static toArticleSrcMasterPath(articleDirPath: string): string {
    articleDirPath = removeStartDirChars(articleDirPath)
    return _path.join(articleDirPath, config.storage.article.masterSrcFileName)
  }

  /**
   * 記事の下書きファイルパスを取得します。
   * @param articleDirPath 記事ディレクトリパス
   */
  static toArticleSrcDraftPath(articleDirPath: string): string {
    articleDirPath = removeStartDirChars(articleDirPath)
    return _path.join(articleDirPath, config.storage.article.draftSrcFileName)
  }

  /**
   * 指定されたパスが記事ルートを含めたファミリーノードか否かを取得します。
   * @param nodePath
   */
  static isArticleRootFamily(nodePath: string): boolean {
    const userRootName = config.storage.user.rootName
    const articleRootName = config.storage.article.rootName
    const reg = new RegExp(`^${userRootName}/[^/]+/(?:${articleRootName}$|${articleRootName}/)`)
    return reg.test(nodePath)
  }

  /**
   * 指定されたパスが記事ルートの配下ノードか否かを取得します。
   * @param nodePath
   */
  static isArticleRootUnder(nodePath: string): boolean {
    const userRootName = config.storage.user.rootName
    const articleRootName = config.storage.article.rootName
    const reg = new RegExp(`^${userRootName}/[^/]+/${articleRootName}/`)
    return reg.test(nodePath)
  }

  /**
   * 指定されたパスがアセットディレクトリを含めたファミリーノードか否かを取得します。
   * @param nodePath
   */
  static isArticleAssetsFamily(nodePath: string): boolean {
    const userRootName = config.storage.user.rootName
    const articleRootName = config.storage.article.rootName
    const assetsName = config.storage.article.assetsName
    const reg = new RegExp(`^${userRootName}/[^/]+/${articleRootName}/(?:${assetsName}$|${assetsName}/)`)
    return reg.test(nodePath)
  }

  /**
   * 記事ノード配列をディレクトリ階層に従ってソートします。
   * @param nodes
   */
  static sortNodes(nodes: StorageNode[]): StorageNode[] {
    const sortChildren = (children: TreeStorageNode<StorageNode>[]) => {
      children.sort((treeNodeA, treeNodeB) => {
        const a = treeNodeA.item
        const b = treeNodeB.item

        if (a.article?.src?.type === 'Draft') return -1
        if (b.article?.src?.type === 'Draft') return 1
        if (a.article?.src?.type === 'Master') return -1
        if (b.article?.src?.type === 'Master') return 1

        if (a.nodeType === b.nodeType) {
          const orderA = a.article?.dir?.sortOrder ?? 0
          const orderB = b.article?.dir?.sortOrder ?? 0
          if (orderA === orderB) {
            const nameA = a.article?.dir?.name || a.name
            const nameB = b.article?.dir?.name || b.name
            return nameA < nameB ? -1 : nameA > nameB ? 1 : 0
          } else {
            return orderB - orderA
          }
        } else {
          return a.nodeType === 'Dir' ? -1 : 1
        }
      })
    }

    const sort = (treeNodes: TreeStorageNode<StorageNode>[]) => {
      for (const treeNode of treeNodes) {
        nodes.push(treeNode.item)
        this.isArticleRootFamily(treeNode.item.path) && sortChildren(treeNode.children)
        sort(treeNode.children)
      }
    }

    // 一旦通常のディレクトリ階層用のソートを行う
    CoreStorageService.sortNodes(nodes)

    // ノード配列をツリー構造に変換し、トップレベルのノードのみ配列に抽出する
    // ※トップレベルノード = 親が存在しないノード
    const topTreeNodes: TreeStorageNode<StorageNode>[] = []
    const treeNodeDict: { [path: string]: TreeStorageNode<StorageNode> } = {}
    for (const node of nodes) {
      const parent = treeNodeDict[node.dir]
      const treeNode: TreeStorageNode<StorageNode> = { item: node, parent, children: [] }
      treeNodeDict[node.path] = treeNode
      if (parent) {
        parent.children.push(treeNode)
      } else {
        topTreeNodes.push(treeNode)
      }
    }

    // 引数ノード配列を一旦クリアする
    // ※この後のソートで並べ替えられたノードがこの配列に設定される
    nodes.splice(0)

    // トップレベルノードが記事ルート配下のものである場合、記事系ソートを行う
    if (topTreeNodes.length && this.isArticleRootUnder(topTreeNodes[0].item.path)) {
      sortChildren(topTreeNodes)
    }

    // トップレベルノードの配下にあるノードのソートを行う
    sort(topTreeNodes)

    return nodes
  }

  /**
   * 記事ディレクトリ名の検証を行います。
   * @param name
   */
  static validateArticleDirName(name?: string) {}
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

//========================================================================
//
//  Exports
//
//========================================================================

export { StorageService, StorageServiceDI, StorageServiceModule }
export { StorageFileNode, StorageUploadDataItem } from './core-storage'
