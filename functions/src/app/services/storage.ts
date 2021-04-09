import * as _path from 'path'
import {
  ArticleListItem,
  ArticleTableOfContentsItem,
  CreateArticleGeneralDirInput,
  CreateArticleTypeDirInput,
  CreateStorageDirInput,
  GetArticleSrcInput,
  GetArticleSrcResult,
  GetUserArticleListInput,
  GetUserArticleTableOfContentsInput,
  IdToken,
  MoveStorageDirInput,
  PaginationInput,
  PaginationResult,
  RenameArticleTypeDirInput,
  SaveArticleDraftSrcFileInput,
  SaveArticleDraftSrcFileResult,
  SaveArticleMasterSrcFileInput,
  SaveArticleMasterSrcFileResult,
  SetShareDetailInput,
  StorageArticleDirLabelByLang,
  StorageArticleDirType,
  StorageNode,
  StorageNodeGetKeyInput,
  StorageSchema,
} from './base'
import { AuthServiceDI, AuthServiceModule } from './base-services/auth'
import {
  DeepPartial,
  RequiredAre,
  arrayToDict,
  pickProps,
  removeBothEndsSlash,
  removeStartDirChars,
  splitHierarchicalPaths,
  summarizeFamilyPaths,
} from 'web-base-lib'
import { ElasticMSearchAPIResponse, ElasticMSearchResponse, ElasticSearchAPIResponse, ElasticSearchResponse } from '../base/elastic'
import { Inject, Module } from '@nestjs/common'
import { Request, Response } from 'express'
import { AppError } from '../base'
import { AuthHelper } from './base/auth'
import { CoreStorageService } from './core-storage'
import { File } from '@google-cloud/storage'
import { LangCode } from '../../../../../web-base-lib/dist'
import { config } from '../../config'
import dayjs = require('dayjs')
import { merge } from 'lodash'
import DBStorageNode = StorageSchema.DBStorageNode
import StorageNodeInput = StorageSchema.StorageNodeInput
import StorageArticleSrcDetailInput = StorageSchema.StorageArticleSrcDetailInput

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
   * 記事系ディレクトリを作成します。
   * @param idToken
   * @param input
   */
  createArticleTypeDir(idToken: IdToken, input: CreateArticleTypeDirInput): Promise<StorageNode>

  /**
   * 記事系ディレクトリを作成します。
   * @param input
   */
  createArticleTypeDir(input: CreateArticleTypeDirInput): Promise<StorageNode>

  async createArticleTypeDir(arg1: IdToken | CreateArticleTypeDirInput, arg2?: CreateArticleTypeDirInput): Promise<StorageNode> {
    let idToken: IdToken | undefined
    let input: CreateArticleTypeDirInput
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      input = arg2!
    } else {
      input = arg1
    }

    if (idToken) {
      // 自ユーザーのノードに対する処理
      if (CoreStorageService.isOwnUserRootUnder(idToken, input.dir)) {
        return this.createArticleTypeDirImpl(input)
      }
      // 他ユーザーのノードに対する処理
      else {
        throw new AppError(`Not implemented yet.`)
      }
    } else {
      return this.createArticleTypeDirImpl(input)
    }
  }

  async createArticleTypeDirImpl(input: CreateArticleTypeDirInput): Promise<StorageNode> {
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
        result = await this.m_createArticleBundle({ ...input, sortOrder })
        break
      case 'Category':
        result = await this.m_createArticleCategory({ ...input, sortOrder })
        break
      case 'Article':
        result = await this.m_createArticle({ ...input, sortOrder })
        break
    }
    return result
  }

  /**
   * 記事ルート配下に一般ディレクトリを作成します。
   * @param idToken
   * @param input
   */
  createArticleGeneralDir(idToken: IdToken, input: CreateArticleGeneralDirInput): Promise<StorageNode>

  /**
   * 記事ルート配下に一般ディレクトリを作成します。
   * @param input
   */
  createArticleGeneralDir(input: CreateArticleGeneralDirInput): Promise<StorageNode>

  async createArticleGeneralDir(arg1: IdToken | CreateArticleGeneralDirInput, arg2?: CreateArticleGeneralDirInput): Promise<StorageNode> {
    let idToken: IdToken | undefined
    let input: CreateArticleGeneralDirInput
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      input = arg2!
    } else {
      input = arg1
    }

    if (idToken) {
      // 自ユーザーのノードに対する処理
      if (CoreStorageService.isOwnUserRootUnder(idToken, input.dir)) {
        return this.createArticleGeneralDirImpl(input)
      }
      // 他ユーザーのノードに対する処理
      else {
        throw new AppError(`Not implemented yet.`)
      }
    } else {
      return this.createArticleGeneralDirImpl(input)
    }
  }

  async createArticleGeneralDirImpl({ dir, share }: CreateArticleGeneralDirInput): Promise<StorageNode> {
    StorageService.validateNodePath(dir)

    // 引数ディレクトリのパスが記事ルート配下のものか検証
    this.m_validateArticleRootUnder(dir)

    const userRootName = config.storage.user.rootName
    const articleRootName = config.storage.article.rootName
    const assetsName = config.storage.article.assetsName

    const hierarchicalDirNodes = await this.getRequiredHierarchicalDirNodes(dir)
    const ancestorDirNodes = hierarchicalDirNodes.filter(node => node.path !== dir)
    const hierarchicalDirNodeDict = arrayToDict(hierarchicalDirNodes, 'path')

    // 祖先ディレクトリが存在することを検証
    for (const iDirNode of ancestorDirNodes) {
      if (!iDirNode.exists) {
        throw new AppError(`The ancestor of the specified path does not exist.`, {
          specifiedPath: dir,
          ancestorPath: iDirNode.path,
        })
      }
    }

    // 引数パスがアセットとその配下以外の場合
    // ※アセットとその配下はディレクトリ作成が可能なので、このブロック内の検証を行う必要はない
    const reg = new RegExp(`^${userRootName}/[^/]+/${articleRootName}/(?:${assetsName}$|${assetsName}/)`)
    if (!reg.test(dir)) {
      // 祖先に記事が存在することを確認
      const parentPath = removeStartDirChars(_path.dirname(dir))
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
        throw new AppError(`The specified path is not under article: '${dir}'`)
      }
    }

    const dirNode = hierarchicalDirNodeDict[dir]
    // 引数ディレクトリがまだ存在しない場合
    if (!dirNode.exists) {
      // ディレクトリを作成
      const id = StorageSchema.generateId()
      const now = dayjs().toISOString()
      await this.client.update({
        index: StorageSchema.IndexAlias,
        id,
        body: {
          doc: {
            ...this.toDBStorageNode(dirNode),
            id,
            share: this.toDBShareDetail(share),
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
      if (share) {
        return await this.setDirShareDetail({ path: dir }, share)
      } else {
        return await this.sgetNode({ path: dir })
      }
    }
  }

  /**
   * 記事系ディレクトリの名前変更を行います。
   * @param idToken
   * @param input
   */
  renameArticleTypeDir(idToken: IdToken, input: RenameArticleTypeDirInput): Promise<StorageNode>

  /**
   * 記事系ディレクトリの名前変更を行います。
   * @param input
   */
  renameArticleTypeDir(input: RenameArticleTypeDirInput): Promise<StorageNode>

  async renameArticleTypeDir(arg1: IdToken | RenameArticleTypeDirInput, arg2?: RenameArticleTypeDirInput): Promise<StorageNode> {
    let idToken: IdToken | undefined
    let input: RenameArticleTypeDirInput
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      input = arg2!
    } else {
      input = arg1
    }

    if (idToken) {
      // 自ユーザーのノードに対する処理
      if (CoreStorageService.isOwnUserRootUnder(idToken, input.dir)) {
        return this.renameArticleDirImpl(input)
      }
      // 他ユーザーのノードに対する処理
      else {
        throw new AppError(`Not implemented yet.`)
      }
    } else {
      return this.renameArticleDirImpl(input)
    }
  }

  protected async renameArticleDirImpl({ lang, dir, label }: RenameArticleTypeDirInput): Promise<StorageNode> {
    dir = removeBothEndsSlash(dir)
    StorageService.validateArticleDirName(label)

    // 引数ディレクトリのパスが実際にディレクトリか検証
    const dirNode = await this.sgetNode({ path: dir })
    if (dirNode.nodeType !== 'Dir') {
      throw new AppError(`The specified path is not a directory.`, { specifiedPath: dir })
    }

    // 引数ディレクトリのパスが記事ルート配下のものか検証
    this.m_validateArticleRootUnder(dir)

    await this.client.update({
      index: StorageSchema.IndexAlias,
      id: dirNode.id,
      body: {
        doc: {
          article: {
            dir: {
              label: { [lang]: label },
            },
          },
          updatedAt: dayjs(),
          version: dirNode.version + 1,
        },
      },
      refresh: true,
    })

    return this.sgetNode({ id: dirNode.id })
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
      // 自ユーザーのノードに対する処理
      if (CoreStorageService.isOwnUserRootUnder(idToken, orderNodePaths[0])) {
        return this.setArticleSortOrderImpl(idToken, orderNodePaths)
      }
      // 他ユーザーのノードに対する処理
      else {
        throw new AppError(`Not implemented yet.`)
      }
    } else {
      return this.setArticleSortOrderImpl(idToken, orderNodePaths)
    }
  }

  protected async setArticleSortOrderImpl(idToken: { uid: string }, orderNodePaths: string[]): Promise<void> {
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

  /**
   * 記事本文を保存します。
   * @param idToken
   * @param input
   */
  saveArticleMasterSrcFile(idToken: IdToken, input: SaveArticleMasterSrcFileInput): Promise<SaveArticleMasterSrcFileResult>

  /**
   * 記事本文を保存します。
   * @param input
   */
  saveArticleMasterSrcFile(input: SaveArticleMasterSrcFileInput): Promise<SaveArticleMasterSrcFileResult>

  async saveArticleMasterSrcFile(
    arg1: IdToken | SaveArticleMasterSrcFileInput,
    arg2?: SaveArticleMasterSrcFileInput
  ): Promise<SaveArticleMasterSrcFileResult> {
    let idToken: IdToken | undefined
    let input: SaveArticleMasterSrcFileInput
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      input = arg2!
    } else {
      input = arg1
    }

    const articleNode = await this.sgetNode({ id: input.articleId })
    const _input: Omit<SaveArticleMasterSrcFileInput, 'articleId'> & { articleNode: StorageNode } = {
      ...pickProps(input, ['lang', 'srcContent', 'textContent']),
      articleNode,
    }

    if (idToken) {
      // 自ユーザーのノードに対する処理
      if (CoreStorageService.isOwnUserRootUnder(idToken, articleNode.path)) {
        return this.saveArticleMasterSrcFileImpl(_input)
      }
      // 他ユーザーのノードに対する処理
      else {
        throw new AppError(`Not implemented yet.`)
      }
    } else {
      return this.saveArticleMasterSrcFileImpl(_input)
    }
  }

  protected async saveArticleMasterSrcFileImpl({
    lang,
    articleNode,
    srcContent,
    textContent,
  }: Omit<SaveArticleMasterSrcFileInput, 'articleId'> & { articleNode: StorageNode }): Promise<SaveArticleMasterSrcFileResult> {
    const now = dayjs()

    // 本文と下書きを保存
    const srcNodes = await Promise.all([
      // 本文を保存
      this.saveGCSFileAndFileNode<StorageNode>(
        StorageService.toArticleMasterSrcPath(articleNode.path),
        srcContent,
        { contentType: 'text/markdown' },
        {
          article: { file: { type: 'MasterSrc' } },
          updatedAt: now,
        }
      ),
      // 下書きを保存
      this.saveGCSFileAndFileNode<StorageNode>(
        StorageService.toArticleDraftSrcPath(articleNode.path),
        '',
        { contentType: 'text/markdown' },
        {
          article: { file: { type: 'DraftSrc' } },
          share: { isPublic: false },
          updatedAt: now,
        }
      ),
    ])
    const { masterNode, draftNode } = srcNodes.reduce((result, srcNode) => {
      const articleFileType = srcNode.article!.file!.type
      if (articleFileType === 'MasterSrc') {
        result.masterNode = srcNode
      } else if (articleFileType === 'DraftSrc') {
        result.draftNode = srcNode
      }
      return result
    }, {} as { masterNode: StorageNode; draftNode: StorageNode })

    // 記事ノードの更新データを作成
    merge(articleNode, <DeepPartial<StorageNodeInput>>{
      article: {
        src: {
          [lang]: <StorageArticleSrcDetailInput>{
            createdAt: now,
            ...articleNode.article?.src?.[lang],
            masterId: masterNode.id,
            draftId: draftNode.id,
            textContent,
            updatedAt: now,
          },
        },
      },
      updatedAt: now,
      version: articleNode.version + 1,
    })
    // 記事ノードを更新
    await this.client.update({
      index: StorageSchema.IndexAlias,
      id: articleNode.id,
      body: {
        doc: this.toDBStorageNode(articleNode),
      },
      refresh: true,
    })
    articleNode = await this.sgetNode(articleNode)

    return { article: articleNode, master: masterNode, draft: draftNode }
  }

  /**
   * 記事下書きを保存します。
   * @param idToken
   * @param input
   */
  saveArticleDraftSrcFile(idToken: IdToken, input: SaveArticleDraftSrcFileInput): Promise<SaveArticleDraftSrcFileResult>

  /**
   * 記事下書きを保存します。
   * @param input
   */
  saveArticleDraftSrcFile(input: SaveArticleDraftSrcFileInput): Promise<SaveArticleDraftSrcFileResult>

  async saveArticleDraftSrcFile(
    arg1: IdToken | SaveArticleDraftSrcFileInput,
    arg2?: SaveArticleDraftSrcFileInput
  ): Promise<SaveArticleDraftSrcFileResult> {
    let idToken: IdToken | undefined
    let input: SaveArticleDraftSrcFileInput
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      input = arg2!
    } else {
      input = arg1
    }

    const articleNode = await this.sgetNode({ id: input.articleId })
    const _input: Omit<SaveArticleDraftSrcFileInput, 'articleId'> & { articleNode: StorageNode } = {
      ...pickProps(input, ['lang', 'srcContent']),
      articleNode,
    }

    if (idToken) {
      // 自ユーザーのノードに対する処理
      if (CoreStorageService.isOwnUserRootUnder(idToken, articleNode.path)) {
        return this.saveArticleDraftSrcFileImpl(_input)
      }
      // 他ユーザーのノードに対する処理
      else {
        throw new AppError(`Not implemented yet.`)
      }
    } else {
      return this.saveArticleDraftSrcFileImpl(_input)
    }
  }

  async saveArticleDraftSrcFileImpl({
    lang,
    articleNode,
    srcContent,
  }: Omit<SaveArticleDraftSrcFileInput, 'articleId'> & { articleNode: StorageNode }): Promise<SaveArticleDraftSrcFileResult> {
    const now = dayjs()
    const existingSrcDetail = articleNode.article?.src?.[lang]

    // 下書きを保存
    const draftNode = await this.saveGCSFileAndFileNode<StorageNode>(
      StorageService.toArticleDraftSrcPath(articleNode.path),
      srcContent ?? '',
      { contentType: 'text/markdown' },
      {
        article: {
          file: { type: 'DraftSrc' },
        },
        share: { isPublic: false },
        updatedAt: now,
      }
    )

    // 今回が初めての下書き保存だった場合
    // ※2回め以降の下書き保存が記事ノードに影響を与えることはない
    if (!existingSrcDetail) {
      // 記事ノードの更新データを作成
      merge(articleNode, <DeepPartial<StorageNodeInput>>{
        article: {
          src: {
            [lang]: <StorageArticleSrcDetailInput>{
              draftId: draftNode.id,
            },
          },
        },
        updatedAt: now,
        version: articleNode.version + 1,
      })
      // 記事ノードを更新
      await this.client.update({
        index: StorageSchema.IndexAlias,
        id: articleNode.id,
        body: { doc: this.toDBStorageNode(articleNode) },
        refresh: true,
      })
      articleNode = await this.sgetNode(articleNode)
    }

    return { article: articleNode, draft: draftNode }
  }

  /**
   * 指定された記事ソースを取得します。
   * @param idToken
   * @param input
   */
  getArticleSrc(idToken: IdToken, input: GetArticleSrcInput): Promise<GetArticleSrcResult | undefined>

  /**
   * 指定された記事ソースを取得します。
   * @param req
   * @param res
   * @param input
   */
  getArticleSrc(req: Request, res: Response, input: GetArticleSrcInput): Promise<Response>

  async getArticleSrc(
    arg1: IdToken | Request,
    arg2?: Response | GetArticleSrcInput,
    arg3?: GetArticleSrcInput
  ): Promise<GetArticleSrcResult | undefined | Response> {
    /**
     * 戻り値の作成を行う関数です。
     * ※この関数を実行するには記事本文があることを前提とします。
     */
    const getResult = async (lang: LangCode, hierarchicalNodes: StorageNode[]) => {
      const share = this.getInheritedShareDetail(hierarchicalNodes)
      const _hierarchicalNodes = [...hierarchicalNodes]
      const articleNode = _hierarchicalNodes.splice(-1)[0]
      const ancestorNodes = _hierarchicalNodes.filter(node => Boolean(node.article))
      const srcDetail = articleNode.article!.src![lang]!

      const { exists, file } = await this.getStorageFile(srcDetail.masterId!)
      let src = ''
      if (exists) {
        src = (await file.download()).toString()
      }

      const result: GetArticleSrcResult = {
        id: articleNode.id,
        label: StorageService.getArticleLangLabel(lang, articleNode.article!.dir!.label),
        src,
        dir: ancestorNodes.map(node => ({
          id: node.id,
          label: StorageService.getArticleLangLabel(lang, node.article!.dir!.label),
        })),
        path: [...ancestorNodes, articleNode].map(node => ({
          id: node.id,
          label: StorageService.getArticleLangLabel(lang, node.article!.dir!.label),
        })),
        isPublic: Boolean(share.isPublic),
        createdAt: srcDetail.createdAt!, // 記事本文があるのならば作成日は設定されている
        updatedAt: srcDetail.updatedAt!, // 記事本文があるのならば更新日は設定されている
      }
      return result
    }

    /**
     * 指定された記事ソースを取得します（※GraphQL版）。
     */
    const getArticleSrcForGQL = async (idToken: IdToken, { lang, articleId }: GetArticleSrcInput) => {
      // 記事ノードを取得
      // ※記事本文があることを確認。ない場合は終了
      const articleNode = await this.getNode({ id: articleId })
      const srcDetail = articleNode?.article?.src?.[lang]
      if (!articleNode || !srcDetail || !srcDetail.masterId) {
        return undefined
      }

      // 記事の共有設定を取得
      const hierarchicalNodes = await this.getHierarchicalNodes(articleNode.path)
      const share = this.getInheritedShareDetail(hierarchicalNodes)

      // 記事の公開フラグがオンの場合
      if (share.isPublic) {
        return await getResult(lang, hierarchicalNodes)
      }

      // リクエストユーザーに記事の読み込み権限があることを検証
      await this.validateReadable(idToken, articleNode.path, hierarchicalNodes)

      // 戻り値を作成して返す
      return await getResult(lang, hierarchicalNodes)
    }

    /**
     * 指定された記事ソースを取得します（※HTTP版）。
     */
    const getArticleSrcForHttp = async (req: Request, res: Response, { lang, articleId }: GetArticleSrcInput) => {
      // 記事ノードを取得
      // ※記事本文があることを確認。ない場合は終了
      const articleNode = await this.getNode({ id: articleId })
      const srcDetail = articleNode?.article?.src?.[lang]
      if (!articleNode || !srcDetail || !srcDetail.masterId) {
        return res.sendStatus(404)
      }

      // 304 Not Modified のチェック
      const notModified = this.checkNotModified(req, srcDetail.updatedAt!)
      res.setHeader('Last-Modified', notModified.lastModified)

      // 記事の共有設定を取得
      const hierarchicalNodes = await this.getHierarchicalNodes(articleNode.path)
      const share = this.getInheritedShareDetail(hierarchicalNodes)

      // 記事の公開フラグがオンの場合
      if (share.isPublic) {
        if (notModified.result) {
          return res.sendStatus(notModified.status)
        } else {
          const result = await getResult(lang, hierarchicalNodes)
          return res.json(result)
        }
      }

      // リクエストユーザーが認証されていることを検証
      const validated = await this.authService.validate(req, res)
      if (!validated.result) {
        return res.sendStatus(validated.error!.getStatus())
      }

      // リクエストユーザーに記事の読み込み権限があることを検証
      await this.validateReadable(validated.idToken!, articleNode.path, hierarchicalNodes)

      // 戻り値を作成して返す
      const result = await getResult(lang, hierarchicalNodes)
      return res.json(result)
    }

    if (AuthHelper.isIdToken(arg1)) {
      const idToken = arg1
      const input = arg2 as GetArticleSrcInput
      return getArticleSrcForGQL(idToken, input)
    } else {
      const req = arg1
      const res = arg2 as Response
      const input = arg3!
      return getArticleSrcForHttp(req, res, input)
    }
  }

  async getUserArticleList(
    idToken: IdToken | undefined,
    { lang, userName, articleTypeDirId }: GetUserArticleListInput,
    pagination?: PaginationInput
  ): Promise<PaginationResult<ArticleListItem>> {
    const maxChunk = pagination?.maxChunk || StorageService.MaxChunk
    const from = pagination?.pageToken ? Number(pagination.pageToken) : 0

    // ユーザー名をキーにしてユーザーを取得
    const user = await this.userHelper.getUser({ userName })
    if (!user) {
      throw new AppError(`The user with the specified 'userName' does not exist.`, { userName })
    }
    const articleRootPath = StorageService.toArticleRootPath({ uid: user.id })

    // 指定された記事系ディレクトリを取得
    const articleTypeDir = await this.getNode({ id: articleTypeDirId })
    if (!articleTypeDir || !articleTypeDir.article?.dir) return { list: [] }

    // 指定された記事系ディレクトリが「記事」の場合は無視
    const articleType = articleTypeDir.article.dir.type
    if (articleType === 'Article') return { list: [] }

    // 指定された記事系ディレクトリとその上位階層を取得
    const hierarchicalNodes = await this.getHierarchicalNodes(articleTypeDir.path)

    // 指定された記事系ディレクトリ直下の記事を取得
    const response = await this.client.search<ElasticSearchResponse<DBStorageNode>>({
      index: StorageSchema.IndexAlias,
      size: maxChunk,
      from,
      body: {
        query: {
          bool: {
            must: [{ term: { dir: articleTypeDir.path } }, { term: { 'article.dir.type': 'Article' } }],
          },
        },
        sort: [{ 'article.dir.sortOrder': 'desc' }],
      },
      _source_includes: this.includeNodeFields,
      _source_excludes: this.excludeNodeFields,
    })
    const articleNodes = this.dbResponseToNodes(response)

    // 取得された記事とその階層を形成するノードをマップ化
    const nodeDict = arrayToDict([...hierarchicalNodes, ...articleNodes], 'path')

    // 取得された記事から戻り値を作成
    const articleList: ArticleListItem[] = []
    for (const articleNode of articleNodes) {
      // 記事とその階層を形成するノードを取得
      const articleHierarchicalNodes = this.retrieveHierarchicalNodes(nodeDict, articleNode.path)
      // リクエスターが指定されたノードを読み込み可能か検証
      const validated = await this.validateReadableImpl(idToken, articleNode.path, articleHierarchicalNodes)
      if (validated) continue

      // 指定言語の記事に本文がなかった場合、次の記事へ移動
      const srcDetail = articleNode.article?.src?.[lang]
      if (!srcDetail?.masterId) continue

      articleList.push({
        ...pickProps(articleNode, ['id', 'name']),
        dir: removeBothEndsSlash(articleNode.dir.replace(articleRootPath, '')),
        path: removeBothEndsSlash(articleNode.path.replace(articleRootPath, '')),
        label: StorageService.getArticleLangLabel(lang, articleNode.article!.dir!.label),
        createdAt: srcDetail.createdAt!, // 記事本文があるのならば作成日は設定されている
        updatedAt: srcDetail.updatedAt!, // 記事本文があるのならば更新日は設定されている
      })
    }

    let nextPageToken: string | undefined
    if (articleList.length === 0 || articleList.length < maxChunk) {
      nextPageToken = undefined
    } else {
      nextPageToken = String(from + articleList.length)
    }

    return { list: articleList, nextPageToken }
  }

  /**
   * 記事の目次を取得します。
   * - ツリーバンドル配下のカテゴリと記事は目次として取得されます。
   * - リストバンドル配下の記事は目次として取得されません。
   * @param idToken
   * @param input
   */
  async getUserArticleTableOfContents(
    idToken: IdToken | undefined,
    { lang, userName }: GetUserArticleTableOfContentsInput
  ): Promise<ArticleTableOfContentsItem[]> {
    // ユーザー名をキーにしてユーザーを取得
    const user = await this.userHelper.getUser({ userName })
    if (!user) {
      throw new AppError(`The user with the specified 'userName' does not exist.`, { userName })
    }
    // ユーザーの記事ルートパスを取得
    const articleRootPath = StorageService.toArticleRootPath({ uid: user.id })

    /**
     * ユーザーの記事ルート配下のノードか否かを判定する関数です。
     */
    const isArticleRootUnder = (path: string) => path.startsWith(`${articleRootPath}/`)

    /**
     * 指定されたノードを目次ノードに変換する関数です。
     */
    const toArticleTableOfContentsItems = (lang: LangCode, nodes: StorageNode[]) => {
      StorageService.sortNodes(nodes)
      return nodes.map(node => {
        const result: ArticleTableOfContentsItem = {
          ...pickProps(node, ['id', 'name']),
          dir: removeBothEndsSlash(node.dir.replace(articleRootPath, '')),
          path: removeBothEndsSlash(node.path.replace(articleRootPath, '')),
          label: StorageService.getArticleLangLabel(lang, node.article!.dir!.label),
          type: node.article!.dir!.type,
        }
        return result
      })
    }

    //
    // 記事ルートと階層を構成するノードを取得
    //
    const articleRootHierarchicalNodes = await this.getHierarchicalNodes(articleRootPath)

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
    // バンドルディレクトリ配下の「カテゴリ」「記事」を取得
    // ・ツリーバンドル配下のカテゴリ、記事は全て取得する
    // ・リストバンドル配下の記事は取得しない
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

    // バンドルディレクトリ配下に記事系ディレクトリがない場合
    if (!queryBody.length) {
      // リストバンドルのみを返す
      return toArticleTableOfContentsItems(
        lang,
        bundleDirs.filter(bundleDir => bundleDir.article?.dir?.type === 'ListBundle')
      )
    }

    const response2 = await this.client.msearch<ElasticMSearchResponse<DBStorageNode>, string[]>({
      body: queryBody,
    })
    const bundleUnderCategoryAndArticle = this.dbResponseToNodes(response2)
    const allNodeDict = [...articleRootHierarchicalNodes, ...bundleDirs, ...bundleUnderCategoryAndArticle].reduce<{ [path: string]: StorageNode }>(
      (result, node) => {
        result[node.path] = node
        return result
      },
      {}
    )

    // リクエスター自身の目次を取得しようとしている場合、検索結果の全てを返す
    if (user.id === idToken?.uid) {
      return toArticleTableOfContentsItems(lang, [...bundleDirs, ...bundleUnderCategoryAndArticle])
    }

    //
    // リクエスターがアクセス可能な「記事」に絞り込み
    //
    const accessibleArticles: StorageNode[] = []
    for (const node of bundleUnderCategoryAndArticle) {
      // 記事以外のノードの場合は次へ移動
      if (node.article?.dir?.type !== 'Article') continue
      // リクエスターが記事を読み込み可能かを検証
      const hierarchicalNodes = this.retrieveHierarchicalNodes(allNodeDict, node.path)
      const error = await this.validateReadableImpl(idToken, node.path, hierarchicalNodes)
      if (error) continue
      // 指定言語の記事に本文があるか検証
      const srcDetail = node.article.src?.[lang]
      if (!srcDetail?.masterId) continue
      // ここまで残った記事はアクセス可能となる
      accessibleArticles.push(node)
    }

    //
    // 取得した記事系ディレクトリを階層構造化
    // ※階層構造の中で重複ノードが発生するのでそれは除去
    //
    const accessibleDirNodes = [...bundleDirs.filter(node => node.article?.dir?.type === 'ListBundle'), ...accessibleArticles]
    const summarizedPaths = summarizeFamilyPaths(accessibleDirNodes.map(node => node.path))
    const allAccessiblePaths = splitHierarchicalPaths(...summarizedPaths).filter(isArticleRootUnder)
    const allAccessibleNodes = allAccessiblePaths.map(path => allNodeDict[path])
    StorageService.sortNodes(allAccessibleNodes)

    return toArticleTableOfContentsItems(lang, allAccessibleNodes)
  }

  //--------------------------------------------------
  //  Overridden
  //--------------------------------------------------

  protected async createDirImpl(input: CreateStorageDirInput): Promise<StorageNode> {
    // このメソッドでは記事ルート配下にディレクトリを作成できない。
    // 例: 'users/xxx/articles'配下にディレクトリを作成できない。
    if (StorageService.isArticleRootUnder(input.dir)) {
      throw new AppError(`This method 'createDir()' cannot create an article under directory '${input.dir}'.`)
    }

    return super.createDirImpl(input)
  }

  protected async createHierarchicalDirsImpl(dirPaths: string[]): Promise<StorageNode[]> {
    // このメソッドでは記事ルート配下にディレクトリを作成できない。
    // 例: 'users/xxx/articles'配下にディレクトリを作成できない。
    for (const dirPath of splitHierarchicalPaths(...dirPaths)) {
      if (StorageService.isArticleRootUnder(dirPath)) {
        throw new AppError(`This method 'createHierarchicalDirs()' cannot create an article under directory '${dirPath}'.`)
      }
    }

    return super.createHierarchicalDirsImpl(dirPaths)
  }

  protected async moveDirImpl(input: MoveStorageDirInput, options?: { maxChunk?: number }): Promise<void> {
    /**
     * 指定されたノードをエラー情報用ノードに変換します。
     */
    const toErrorNodeData = (node: StorageNode) => {
      const article = node.article ? pickProps(node.article, ['dir', 'file']) : undefined
      return { ...pickProps(node, ['id', 'path']), article }
    }

    input.fromDir = removeBothEndsSlash(input.fromDir)
    input.toDir = removeBothEndsSlash(input.toDir)

    StorageService.validateNodePath(input.toDir)

    const fromDirNode = await this.sgetNode({ path: input.fromDir })
    const fromArticleDirType = fromDirNode.article?.dir?.type
    switch (fromDirNode.article?.dir?.type) {
      // 移動ノードがバンドルの場合
      // ※バンドルは移動不可
      case 'ListBundle':
      case 'TreeBundle': {
        throw new AppError('Article bundles cannot be moved.', {
          movingNode: toErrorNodeData(fromDirNode),
        })
      }
      // 移動ノードが｢カテゴリ｣の場合
      // ※カテゴリは｢ツリーバンドル、カテゴリ｣へのみ移動可能
      case 'Category': {
        const toParentNode = await this.sgetNode({ path: _path.dirname(input.toDir) })
        const toParentArticleDirType = toParentNode.article?.dir?.type
        // カテゴリは｢ツリーバンドル、カテゴリ｣へのみ移動可能。それ以外へは移動不可
        if (!(toParentArticleDirType === 'TreeBundle' || toParentArticleDirType === 'Category')) {
          throw new AppError('Categories can only be moved to category bundles or categories.', {
            movingNode: toErrorNodeData(fromDirNode),
            toParentNode: toErrorNodeData(toParentNode),
          })
        }
        break
      }
      // 移動ノードが記事の場合
      // ※記事は｢リストバンドル、ツリーバンドル、カテゴリ｣へのみ移動可能
      case 'Article': {
        const toParentNode = await this.sgetNode({ path: _path.dirname(input.toDir) })
        const toParentArticleDirType = toParentNode.article?.dir?.type
        if (!(toParentArticleDirType === 'ListBundle' || toParentArticleDirType === 'TreeBundle' || toParentArticleDirType === 'Category')) {
          throw new AppError('Articles can only be moved to list bundles or category bundles or categories.', {
            movingNode: toErrorNodeData(fromDirNode),
            toParentNode: toErrorNodeData(toParentNode),
          })
        }
        break
      }
      // 移動ノードが｢一般ディレクトリ｣の場合
      // ※一般ディレクトリは｢一般ディレクトリ、記事｣へのみ移動可能
      default: {
        const toParentPath = removeStartDirChars(_path.dirname(input.toDir))
        // 移動先がルートノード以外の場合
        if (toParentPath) {
          const toParentNode = await this.sgetNode({ path: toParentPath })
          const toParentArticleDirType = toParentNode.article?.dir?.type
          // 移動先が｢一般ディレクトリ、記事｣以外の場合
          if (!(!toParentArticleDirType || toParentArticleDirType === 'Article')) {
            throw new AppError('The general directory can only be moved to the general directory or articles.', {
              movingNode: toErrorNodeData(fromDirNode),
              toParentNode: toErrorNodeData(toParentNode),
            })
          }
        }
        break
      }
    }

    //
    // ディレクトリの移動を実行
    //
    await super.moveDirImpl(input, options)

    //
    // 移動ディレクトリにソート順を設定
    //
    // 移動ディレクトリが｢カテゴリ、記事｣の場合
    // ※1 バンドルは移動できないので対象外
    // ※2 記事系ディレクトリ以外のディレクトリにソート順は設定されないので対象外
    if (fromArticleDirType === 'Category' || fromArticleDirType === 'Article') {
      const sortOrder = await this.m_getNewArticleSortOrder({ path: input.toDir })
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
    return StorageSchema.dbResponseToEntities(dbResponse)
  }

  protected toStorageNode(dbNode: DBStorageNode): StorageNode {
    return StorageSchema.toEntity(dbNode)
  }

  protected toDBStorageNode(node: StorageNodeInput): DBStorageNode {
    return StorageSchema.toDBEntity(node)
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
   */
  private async m_createArticleBundle(input: RequiredAre<CreateArticleTypeDirInput, 'sortOrder'>): Promise<StorageNode> {
    StorageService.validateNodePath(input.dir)
    StorageService.validateArticleDirName(input.label)
    const parentPath = removeBothEndsSlash(input.dir)

    // 指定されたディレクトリパスが記事ルート直下であることを検証
    const userRootName = config.storage.user.rootName
    const articleRootName = config.storage.article.rootName
    const reg = new RegExp(`${userRootName}/[^/]+/${articleRootName}$`)
    if (!reg.test(parentPath)) {
      throw new AppError(`The article bundle must be created directly under the article root.`, {
        input: pickProps(input, ['dir', 'label', 'type']),
      })
    }

    // バンドルを作成
    const dirPath = _path.join(input.dir, input.id ?? StorageSchema.generateId())
    // return this.m_createArticleTypeDir(dirPath, input)
    return this.m_createArticleTypeDir(dirPath, input)
  }

  /**
   * カテゴリディレクトリを作成します。
   * @param input
   */
  private async m_createArticleCategory(input: RequiredAre<CreateArticleTypeDirInput, 'sortOrder'>): Promise<StorageNode> {
    StorageService.validateNodePath(input.dir)
    StorageService.validateArticleDirName(input.label)
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
    const dirPath = _path.join(input.dir, input.id ?? StorageSchema.generateId())
    return this.m_createArticleTypeDir(dirPath, { ...input, type: 'Category' })
  }

  /**
   * 記事を作成します。
   * ※記事ディレクトリには記事に必要なファイルが格納されることになります。
   * @param input
   */
  private async m_createArticle(input: RequiredAre<CreateArticleTypeDirInput, 'sortOrder'>): Promise<StorageNode> {
    StorageService.validateArticleDirName(input.label)
    const articlePath = _path.join(input.dir, input.id ?? StorageSchema.generateId())
    const parentPath = removeBothEndsSlash(input.dir)

    // 引数ディレクトリの階層構造形成に必要なノードを取得
    const hierarchicalNodes = await this.getRequiredHierarchicalDirNodes(articlePath)
    const hierarchicalNodeDict = arrayToDict(hierarchicalNodes, 'path')

    // 親ディレクトリが｢リストバンドル、ツリーバンドル、カテゴリ｣以外の場合、
    // カテゴリの作成はできないためエラー
    const parentNode = hierarchicalNodeDict[parentPath]
    const parentArticleDirType = parentNode.article?.dir?.type
    if (!parentNode.exists) {
      throw new AppError(`There is no parent directory for the article to be created.`, { parentPath })
    }
    if (!(parentArticleDirType === 'ListBundle' || parentArticleDirType === 'TreeBundle' || parentArticleDirType === 'Category')) {
      throw new AppError(`Articles cannot be created under the specified parent.`, {
        parentNode: pickProps(parentNode, ['id', 'path', 'article']),
      })
    }

    // 祖先に記事が存在しないことをチェック
    for (const iDirNode of hierarchicalNodes.filter(node => node.path !== articlePath)) {
      if (iDirNode.article?.dir?.type === 'Article') {
        throw new AppError(`The article cannot be created under article.`, {
          specifiedDirPath: articlePath,
          ancestorDirPath: iDirNode.path,
        })
      }
    }

    // 記事ノードを作成
    const articleNode = await this.m_createArticleTypeDir(hierarchicalNodes, { ...input, type: 'Article' })

    // 更新された最新の記事を取得
    return await this.sgetNode(articleNode)
  }

  /**
   * 記事ルート配下にディレクトリを作成します。
   * @param dirPath
   * @param input
   */
  private async m_createArticleTypeDir(
    dirPath: string,
    input: {
      lang: LangCode
      label: string
      type: StorageArticleDirType
      sortOrder: number
      share?: SetShareDetailInput
    }
  ): Promise<StorageNode>

  /**
   * 記事ルート配下に記事系ディレクトリを作成します。
   * @param hierarchicalDirNodes
   * @param input
   */
  private async m_createArticleTypeDir(
    hierarchicalDirNodes: (StorageNode & { exists: boolean })[],
    input: {
      lang: LangCode
      label: string
      type: StorageArticleDirType
      sortOrder: number
      share?: SetShareDetailInput
    }
  ): Promise<StorageNode>

  private async m_createArticleTypeDir(
    dirPath_or_hierarchicalDirNodes: string | (StorageNode & { exists: boolean })[],
    input: {
      lang: LangCode
      label: string
      type: StorageArticleDirType
      sortOrder: number
      share?: SetShareDetailInput
    }
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
    const now = dayjs()
    await this.client.update({
      index: StorageSchema.IndexAlias,
      id,
      body: {
        doc: {
          ...this.toDBStorageNode({
            ...dirNode,
            id,
            share: this.toDBShareDetail(input.share),
            version: 1,
            createdAt: now,
            updatedAt: now,
            article: {
              dir: {
                ...pickProps(input, ['type', 'sortOrder']),
                label: { [input.lang]: input.label },
              },
            },
          }),
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
   * @param articlePath 記事パス
   */
  static toArticleMasterSrcPath(articlePath: string): string {
    articlePath = removeStartDirChars(articlePath)
    return _path.join(articlePath, config.storage.article.masterSrcFileName)
  }

  /**
   * 記事の下書きファイルパスを取得します。
   * @param articlePath 記事パス
   */
  static toArticleDraftSrcPath(articlePath: string): string {
    articlePath = removeStartDirChars(articlePath)
    return _path.join(articlePath, config.storage.article.draftSrcFileName)
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
   * 指定された言語の記事ラベルを取得します。
   * @param lang
   * @param labelByLang
   */
  static getArticleLangLabel(lang: LangCode, labelByLang?: StorageArticleDirLabelByLang): string {
    if (!labelByLang) return ''

    let label = labelByLang[lang]
    if (label) return label

    label = labelByLang['en']
    if (label) return label

    for (label of Object.values(labelByLang)) {
      if (label) return label
    }
    return ''
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

        if (a.article?.file?.type === 'DraftSrc') return -1
        if (b.article?.file?.type === 'DraftSrc') return 1
        if (a.article?.file?.type === 'MasterSrc') return -1
        if (b.article?.file?.type === 'MasterSrc') return 1

        if (a.nodeType === b.nodeType) {
          const orderA = a.article?.dir?.sortOrder ?? 0
          const orderB = b.article?.dir?.sortOrder ?? 0
          if (orderA === orderB) {
            const nameA = a.name
            const nameB = b.name
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
   * 記事名の検証を行います。
   * @param label
   */
  static validateArticleDirName(label?: string) {}
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
