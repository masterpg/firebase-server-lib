import * as _path from 'path'
import {
  ArticleContentFields,
  ArticleContentType,
  ArticleDirLabelByLang,
  ArticleDirType,
  ArticleListItem,
  ArticleSrcByLang,
  ArticleTableOfContentsItem,
  CreateArticleGeneralDirInput,
  CreateArticleTypeDirInput,
  CreateStorageDirInput,
  GetArticleContentsNodeInput,
  GetArticleSrcContentInput,
  GetArticleSrcContentResult,
  GetUserArticleListInput,
  GetUserArticleTableOfContentsInput,
  IdToken,
  MoveStorageDirInput,
  PaginationInput,
  PaginationResult,
  RenameArticleTypeDirInput,
  SaveArticleDraftContentInput,
  SaveArticleSrcContentInput,
  SetShareDetailInput,
  StorageNode,
  StorageNodeGetKeyInput,
  StorageSchema,
} from './base'
import { AuthServiceDI, AuthServiceModule } from './base-services/auth'
import {
  DeepPartial,
  LangCode,
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
import { config } from '../../config'
import dayjs = require('dayjs')
import { merge } from 'lodash'
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

  protected get sourceExcludes(): string[] {
    return [
      ...super.sourceExcludes,
      ArticleContentFields.ja.SrcContent,
      ArticleContentFields.ja.DraftContent,
      ArticleContentFields.ja.SearchContent,
      ArticleContentFields.en.SrcContent,
      ArticleContentFields.en.DraftContent,
      ArticleContentFields.en.SearchContent,
    ]
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
      let nearestArticleDirType: ArticleDirType | undefined = undefined
      for (let i = ancestorDirNodes.length - 1; i >= 0; i--) {
        const ancestorNode = ancestorDirNodes[i]
        const articleDirType = ancestorNode?.article?.type
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

    const dirNode = await this.sgetNode({ path: dir })

    // 引数ディレクトリのパスが実際にディレクトリか検証
    if (dirNode.nodeType !== 'Dir') {
      throw new AppError(`The specified path is not a directory.`, { dir })
    }

    // 引数ディレクトリのパスが記事ルート配下のものか検証
    this.m_validateArticleRootUnder(dir)

    // 引数ディレクトリが記事系ディレクトリか検証
    if (!dirNode.article?.type) {
      throw new AppError(`The specified path is not a article type directory.`, { dir })
    }

    await this.client.update({
      index: StorageSchema.IndexAlias,
      id: dirNode.id,
      body: {
        doc: {
          article: {
            label: { [lang]: label },
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
    const parentArticleDirType = parentNode.article?.type

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
            filter: [
              { term: { dir: parentPath } },
              // ソート順を設定できるのは記事系ディレクトリのみ
              { exists: { field: 'article' } },
            ],
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
            if (ctx._source.article != null) {
              ctx._source.article.sortOrder = params[ctx._source.path]
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
   * @param key
   * @param input
   */
  saveArticleSrcContent(idToken: IdToken, key: StorageNodeGetKeyInput, input: SaveArticleSrcContentInput): Promise<StorageNode>

  /**
   * 記事本文を保存します。
   * @param key
   * @param input
   */
  saveArticleSrcContent(key: StorageNodeGetKeyInput, input: SaveArticleSrcContentInput): Promise<StorageNode>

  async saveArticleSrcContent(
    arg1: IdToken | StorageNodeGetKeyInput,
    arg2: StorageNodeGetKeyInput | SaveArticleSrcContentInput,
    arg3?: SaveArticleSrcContentInput
  ): Promise<StorageNode> {
    let idToken: IdToken | undefined
    let key: StorageNodeGetKeyInput
    let input: SaveArticleSrcContentInput
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      key = arg2 as StorageNodeGetKeyInput
      input = arg3!
    } else {
      key = arg1
      input = arg2 as SaveArticleSrcContentInput
    }

    const articleNode = await this.sgetNode(key)

    if (idToken) {
      // 自ユーザーのノードに対する処理
      if (CoreStorageService.isOwnUserRootUnder(idToken, articleNode.path)) {
        return this.saveArticleSrcContentImpl(articleNode, input)
      }
      // 他ユーザーのノードに対する処理
      else {
        throw new AppError(`Not implemented yet.`)
      }
    } else {
      return this.saveArticleSrcContentImpl(articleNode, input)
    }
  }

  protected async saveArticleSrcContentImpl(
    articleNode: StorageNode,
    { lang, srcContent, searchContent }: SaveArticleSrcContentInput
  ): Promise<StorageNode> {
    if (articleNode.article?.type !== 'Article') {
      throw new AppError(`The specified node is not an article.`, { key: pickProps(articleNode, ['id', 'path']) })
    }

    const now = dayjs()
    const existingSrcDetail = articleNode.article?.src?.[lang]

    // 記事ノードの更新データを作成
    delete articleNode.article?.src
    merge(articleNode, <DeepPartial<StorageNode>>{
      article: {
        src: {
          [lang]: {
            ...existingSrcDetail,
            srcContent,
            draftContent: undefined,
            searchContent,
            createdAt: existingSrcDetail?.createdAt ?? now,
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
    articleNode = await this.sgetNode(articleNode, [
      ArticleContentFields[lang].SrcContent,
      ArticleContentFields[lang].DraftContent,
      ArticleContentFields[lang].SearchContent,
    ])

    return articleNode
  }

  /**
   * 記事下書きを保存します。
   * @param idToken
   * @param key
   * @param input
   */
  saveArticleDraftContent(idToken: IdToken, key: StorageNodeGetKeyInput, input: SaveArticleDraftContentInput): Promise<StorageNode>

  /**
   * 記事下書きを保存します。
   * @param key
   * @param input
   */
  saveArticleDraftContent(key: StorageNodeGetKeyInput, input: SaveArticleDraftContentInput): Promise<StorageNode>

  async saveArticleDraftContent(
    arg1: IdToken | StorageNodeGetKeyInput,
    arg2: StorageNodeGetKeyInput | SaveArticleDraftContentInput,
    arg3?: SaveArticleDraftContentInput
  ): Promise<StorageNode> {
    let idToken: IdToken | undefined
    let key: StorageNodeGetKeyInput
    let input: SaveArticleDraftContentInput
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      key = arg2 as StorageNodeGetKeyInput
      input = arg3!
    } else {
      key = arg1
      input = arg2 as SaveArticleDraftContentInput
    }

    const { lang } = input
    const articleNode = await this.sgetNode(key, [ArticleContentFields[lang].SrcContent, ArticleContentFields[lang].SearchContent])

    if (idToken) {
      // 自ユーザーのノードに対する処理
      if (CoreStorageService.isOwnUserRootUnder(idToken, articleNode.path)) {
        return this.saveArticleDraftContentImpl(articleNode, input)
      }
      // 他ユーザーのノードに対する処理
      else {
        throw new AppError(`Not implemented yet.`)
      }
    } else {
      return this.saveArticleDraftContentImpl(articleNode, input)
    }
  }

  async saveArticleDraftContentImpl(articleNode: StorageNode, { lang, draftContent }: SaveArticleDraftContentInput): Promise<StorageNode> {
    if (articleNode.article?.type !== 'Article') {
      throw new AppError(`The specified node is not an article.`, { key: pickProps(articleNode, ['id', 'path']) })
    }

    const now = dayjs()

    // 記事ノードの更新データを作成
    delete articleNode.article?.src
    merge(articleNode, <DeepPartial<StorageNode>>{
      article: {
        src: {
          [lang]: {
            draftContent,
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
    articleNode = await this.sgetNode(articleNode, [ArticleContentFields[lang].SrcContent, ArticleContentFields[lang].DraftContent])

    return articleNode
  }

  /**
   * 指定された記事コンテンツを取得します。
   * @param idToken
   * @param key
   * @param input
   */
  getArticleContentsNode(idToken: IdToken, key: StorageNodeGetKeyInput, input: GetArticleContentsNodeInput): Promise<StorageNode | undefined>

  /**
   * 指定された記事コンテンツを取得します。
   * @param key
   * @param input
   */
  getArticleContentsNode(key: StorageNodeGetKeyInput, input: GetArticleContentsNodeInput): Promise<StorageNode>

  async getArticleContentsNode(
    arg1: IdToken | StorageNodeGetKeyInput,
    arg2: StorageNodeGetKeyInput | GetArticleContentsNodeInput,
    arg3?: GetArticleContentsNodeInput
  ): Promise<StorageNode | undefined> {
    let idToken: IdToken | undefined
    let key: StorageNodeGetKeyInput
    let input: GetArticleContentsNodeInput
    if (AuthHelper.isIdToken(arg1)) {
      idToken = arg1
      key = arg2 as StorageNodeGetKeyInput
      input = arg3!
    } else {
      key = arg1
      input = arg2 as GetArticleContentsNodeInput
    }

    const sourceIncludes = ArticleContentType.toSourceIncludes(input.lang, input.contentTypes)
    const articleNode = await this.getNode(key, sourceIncludes)
    if (!articleNode || articleNode.article?.type !== 'Article') return undefined

    if (idToken) {
      // 自ユーザーのノードに対する処理
      if (CoreStorageService.isOwnUserRootUnder(idToken, articleNode.path)) {
        return articleNode
      }
      // 他ユーザーのノードに対する処理
      else {
        await this.validateReadable(idToken, articleNode.path)
        return articleNode
      }
    } else {
      return articleNode
    }
  }

  /**
   * 指定された記事本文を取得します。
   * @param idToken
   * @param input
   */
  getArticleSrcContent(idToken: IdToken, input: GetArticleSrcContentInput): Promise<GetArticleSrcContentResult | undefined>

  /**
   * 指定された記事本文を取得します。
   * @param req
   * @param res
   * @param input
   */
  getArticleSrcContent(req: Request, res: Response, input: GetArticleSrcContentInput): Promise<Response>

  async getArticleSrcContent(
    arg1: IdToken | Request,
    arg2: Response | GetArticleSrcContentInput,
    arg3?: GetArticleSrcContentInput
  ): Promise<GetArticleSrcContentResult | undefined | Response> {
    /**
     * 戻り値の作成を行う関数です。
     * ※この関数を実行するには記事本文の保存が行われていることを前提とします。
     */
    const _getResult = async (lang: LangCode, hierarchicalNodes: StorageNode[]) => {
      const share = this.getInheritedShareDetail(hierarchicalNodes)
      const _hierarchicalNodes = [...hierarchicalNodes]
      const articleNode = _hierarchicalNodes.splice(-1)[0]
      const ancestorNodes = _hierarchicalNodes.filter(node => Boolean(node.article))
      const srcDetail = articleNode.article!.src![lang]!

      const result: GetArticleSrcContentResult = {
        id: articleNode.id,
        label: StorageService.getArticleLangLabel(lang, articleNode.article!.label),
        srcContent: srcDetail.srcContent ?? '',
        dir: ancestorNodes.map(node => ({
          id: node.id,
          label: StorageService.getArticleLangLabel(lang, node.article!.label),
        })),
        path: [...ancestorNodes, articleNode].map(node => ({
          id: node.id,
          label: StorageService.getArticleLangLabel(lang, node.article!.label),
        })),
        isPublic: Boolean(share.isPublic),
        createdAt: srcDetail.createdAt!, // 記事本文の保存が行われているなら作成日は設定されている
        updatedAt: srcDetail.updatedAt!, // 記事本文の保存が行われているなら更新日は設定されている
      }
      return result
    }

    /**
     * 指定された記事コンテンツを取得します（※GraphQL版）。
     */
    const getArticleSrcContentForGQL = async (idToken: IdToken, { lang, articleId }: GetArticleSrcContentInput) => {
      // 記事ノードを取得
      // ※記事本文の保存が行われていることを確認。ない場合は終了
      const articleNode = await this.getNode({ id: articleId }, [ArticleContentFields[lang].SrcContent])
      const srcDetail = articleNode?.article?.src?.[lang]
      if (!articleNode || !srcDetail || !srcDetail.createdAt) {
        return undefined
      }

      // 記事の共有設定を取得
      const ancestorNodes = await this.getAncestorDirs(articleNode.path)
      const hierarchicalNodes = [...ancestorNodes, articleNode]
      const share = this.getInheritedShareDetail(hierarchicalNodes)

      // 記事の公開フラグがオンの場合
      if (share.isPublic) {
        return await _getResult(lang, hierarchicalNodes)
      }

      // リクエストユーザーに記事の読み込み権限があることを検証
      await this.validateReadable(idToken, articleNode.path, hierarchicalNodes)

      // 戻り値を作成して返す
      return await _getResult(lang, hierarchicalNodes)
    }

    /**
     * 指定された記事コンテンツを取得します（※HTTP版）。
     */
    const getArticleSrcContentForHttp = async (req: Request, res: Response, { lang, articleId }: GetArticleSrcContentInput) => {
      // 記事ノードを取得
      // ※記事本文の保存が行われていることを確認。ない場合は終了
      const articleNode = await this.getNode({ id: articleId }, [ArticleContentFields[lang].SrcContent])
      const srcDetail = articleNode?.article?.src?.[lang]
      if (!articleNode || !srcDetail || !srcDetail.createdAt) {
        return res.sendStatus(404)
      }

      // 304 Not Modified のチェック
      const notModified = this.checkNotModified(req, srcDetail.updatedAt!)
      res.setHeader('Last-Modified', notModified.lastModified)

      // 記事の共有設定を取得
      const ancestorNodes = await this.getAncestorDirs(articleNode.path)
      const hierarchicalNodes = [...ancestorNodes, articleNode]
      const share = this.getInheritedShareDetail(hierarchicalNodes)

      // 記事の公開フラグがオンの場合
      if (share.isPublic) {
        if (notModified.result) {
          return res.sendStatus(notModified.status)
        } else {
          const result = await _getResult(lang, hierarchicalNodes)
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
      const result = await _getResult(lang, hierarchicalNodes)
      return res.json(result)
    }

    if (AuthHelper.isIdToken(arg1)) {
      const idToken = arg1
      const input = arg2 as GetArticleSrcContentInput
      return getArticleSrcContentForGQL(idToken, input)
    } else {
      const req = arg1
      const res = arg2 as Response
      const input = arg3!
      return getArticleSrcContentForHttp(req, res, input)
    }
  }

  async getUserArticleList(
    idToken: IdToken | undefined,
    { lang, userName, articleTypeDirId }: GetUserArticleListInput,
    pagination?: PaginationInput
  ): Promise<PaginationResult<ArticleListItem>> {
    const pageSize = pagination?.pageSize || StorageService.PageSize
    const from = pagination?.pageToken ? Number(pagination.pageToken) : 0

    // ユーザー名をキーにしてユーザーを取得
    const user = await this.userHelper.getUser({ userName })
    if (!user) {
      throw new AppError(`The user with the specified 'userName' does not exist.`, { userName })
    }
    const articleRootPath = StorageService.toArticleRootPath({ uid: user.id })

    // 指定された記事系ディレクトリを取得
    const articleTypeDir = await this.getNode({ id: articleTypeDirId })
    if (!articleTypeDir || !articleTypeDir.article) return { list: [], total: 0 }

    // 指定された記事系ディレクトリが「記事」の場合は無視
    const articleType = articleTypeDir.article.type
    if (articleType === 'Article') return { list: [], total: 0 }

    // 指定された記事系ディレクトリとその上位階層を取得
    const hierarchicalNodes = await this.getHierarchicalNodes(articleTypeDir.path)

    // 指定された記事系ディレクトリ直下の記事を取得
    const response = await this.client.search<ElasticSearchResponse<DBStorageNode>>({
      index: StorageSchema.IndexAlias,
      size: pageSize,
      from,
      body: {
        query: {
          bool: {
            filter: [{ term: { dir: articleTypeDir.path } }, { term: { 'article.type': 'Article' } }],
          },
        },
        sort: [{ 'article.sortOrder': 'desc' }],
      },
      _source_excludes: this.sourceExcludes,
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

      // 指定言語の記事本文の保存が行われていなかった場合、次の記事へ移動
      const srcDetail = articleNode.article?.src?.[lang]
      if (!srcDetail?.createdAt) continue

      articleList.push({
        ...pickProps(articleNode, ['id', 'name']),
        dir: removeBothEndsSlash(articleNode.dir.replace(articleRootPath, '')),
        path: removeBothEndsSlash(articleNode.path.replace(articleRootPath, '')),
        label: StorageService.getArticleLangLabel(lang, articleNode.article!.label),
        createdAt: srcDetail.createdAt!, // 記事本文があるのならば作成日は設定されている
        updatedAt: srcDetail.updatedAt!, // 記事本文があるのならば更新日は設定されている
      })
    }

    let nextPageToken: string | undefined
    if (articleList.length === 0 || articleList.length < pageSize) {
      nextPageToken = undefined
    } else {
      nextPageToken = String(from + articleList.length)
    }

    return { list: articleList, nextPageToken, total: response.body.hits.total.value }
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
          label: StorageService.getArticleLangLabel(lang, node.article!.label),
          type: node.article!.type,
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
      size: StorageService.ChunkSize,
      body: {
        query: {
          bool: {
            filter: [
              { term: { dir: articleRootPath } },
              {
                terms: { 'article.type': ['ListBundle', 'TreeBundle'] },
              },
            ],
          },
        },
      },
      _source_excludes: this.sourceExcludes,
    })
    const bundleDirs = this.dbResponseToNodes(response1)

    //
    // バンドルディレクトリ配下の「カテゴリ」「記事」を取得
    //
    const queryBody: string[] = []
    for (const bundleNode of bundleDirs) {
      const header = { index: StorageSchema.IndexAlias }
      const body = {
        size: StorageService.ChunkSize,
        query: {
          bool: {
            filter: [
              { wildcard: { path: `${bundleNode.path}/*` } },
              {
                terms: { 'article.type': ['Category', 'Article'] },
              },
            ],
          },
        },
        _source: {
          excludes: this.sourceExcludes,
        },
      }
      queryBody.push(JSON.stringify(header))
      queryBody.push(JSON.stringify(body))
    }

    let bundleUnderCategoryAndArticle: StorageNode[] = []
    let allNodeDict: { [path: string]: StorageNode } = {}
    if (queryBody.length) {
      const response2 = await this.client.msearch<ElasticMSearchResponse<DBStorageNode>, string[]>({
        body: queryBody,
      })
      bundleUnderCategoryAndArticle = this.dbResponseToNodes(response2)
      allNodeDict = [...articleRootHierarchicalNodes, ...bundleDirs, ...bundleUnderCategoryAndArticle].reduce<{ [path: string]: StorageNode }>(
        (result, node) => {
          result[node.path] = node
          return result
        },
        {}
      )
    }

    //
    // リクエスターがアクセス可能な「記事」に絞り込み
    //
    const accessibleArticles: StorageNode[] = []
    for (const node of bundleUnderCategoryAndArticle) {
      // 記事以外のノードの場合は次へ移動
      if (node.article?.type !== 'Article') continue
      // リクエスターが記事を読み込み可能かを検証
      const hierarchicalNodes = this.retrieveHierarchicalNodes(allNodeDict, node.path)
      const error = await this.validateReadableImpl(idToken, node.path, hierarchicalNodes)
      if (error) continue
      // 指定言語の記事本文の保存が行われていなかった場合、次の記事へ移動
      const srcDetail = node.article.src?.[lang]
      if (!srcDetail?.createdAt) continue
      // ここまで残った記事はアクセス可能となる
      accessibleArticles.push(node)
    }

    //
    // 取得した記事系ディレクトリを階層構造化
    //
    const summarizedPaths = summarizeFamilyPaths(accessibleArticles.map(node => node.path))
    const allAccessiblePaths = splitHierarchicalPaths(...summarizedPaths).filter(isArticleRootUnder)
    const allAccessibleNodes = allAccessiblePaths.reduce((result, nodePath) => {
      const node = allNodeDict[nodePath]
      if (node.article!.type === 'Article') {
        const parentNode = allNodeDict[node.dir]
        // 記事の親がリストバンドル場合、その記事は戻り値に設定しない
        if (parentNode.article!.type !== 'ListBundle') {
          result.push(node)
        }
      } else {
        result.push(node)
      }
      return result
    }, [] as StorageNode[])
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

  protected async moveDirImpl(input: MoveStorageDirInput, options?: { pageSize?: number }): Promise<void> {
    /**
     * 指定されたノードをエラー情報用ノードに変換します。
     */
    const toErrorNodeData = (node: StorageNode) => {
      const article = node.article ? pickProps(node.article, ['type', 'label']) : undefined
      return { ...pickProps(node, ['id', 'path']), article }
    }

    input.fromDir = removeBothEndsSlash(input.fromDir)
    input.toDir = removeBothEndsSlash(input.toDir)

    StorageService.validateNodePath(input.toDir)

    const fromDirNode = await this.sgetNode({ path: input.fromDir })
    const fromArticleDirType = fromDirNode.article?.type
    switch (fromArticleDirType) {
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
        const toParentArticleDirType = toParentNode.article?.type
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
        const toParentArticleDirType = toParentNode.article?.type
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
          const toParentArticleDirType = toParentNode.article?.type
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
              sortOrder,
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

  protected toDBStorageNode(node: StorageNode): DBStorageNode {
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
    return this.m_createArticleTypeDir(
      dirPath,
      {
        ...pickProps(input, ['type', 'type', 'sortOrder']),
        label: <ArticleDirLabelByLang>{ [input.lang]: input.label },
      },
      {
        share: {
          isPublic: false,
          ...input.share,
        },
      }
    )
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
    const parentArticleDirType = parentNode?.article?.type
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
    return this.m_createArticleTypeDir(
      dirPath,
      {
        ...pickProps(input, ['type', 'type', 'sortOrder']),
        label: <ArticleDirLabelByLang>{ [input.lang]: input.label },
      },
      { share: input.share }
    )
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
    const parentArticleDirType = parentNode.article?.type
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
      if (iDirNode.article?.type === 'Article') {
        throw new AppError(`The article cannot be created under article.`, {
          specifiedDirPath: articlePath,
          ancestorDirPath: iDirNode.path,
        })
      }
    }

    // 記事ノードを作成
    const articleNode = await this.m_createArticleTypeDir(
      hierarchicalNodes,
      {
        ...pickProps(input, ['type', 'type', 'sortOrder']),
        label: <ArticleDirLabelByLang>{ [input.lang]: input.label },
      },
      {
        share: input.share,
      }
    )

    // 更新された最新の記事を取得
    return await this.sgetNode(articleNode)
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
      label: ArticleDirLabelByLang
      type: ArticleDirType
      sortOrder: number
      src?: ArticleSrcByLang
    },
    options?: {
      share?: SetShareDetailInput
    }
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
      label: ArticleDirLabelByLang
      type: ArticleDirType
      sortOrder: number
      src?: ArticleSrcByLang
    },
    options?: {
      share?: SetShareDetailInput
    }
  ): Promise<StorageNode>

  private async m_createArticleTypeDir(
    dirPath_or_hierarchicalDirNodes: string | (StorageNode & { exists: boolean })[],
    input: {
      label: ArticleDirLabelByLang
      type: ArticleDirType
      sortOrder: number
      src?: ArticleSrcByLang
    },
    options?: {
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
            share: this.toDBShareDetail(options?.share),
            article: input,
            version: 1,
            createdAt: now,
            updatedAt: now,
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
    const bundleArticleDirTyp = bundle?.article?.type
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
            filter: [
              { term: { dir: parentPath } },
              {
                bool: { must_not: [{ term: { path: nodePath } }] },
              },
            ],
          },
        },
        aggs: {
          maxArticleSortOrder: {
            max: { field: 'article.sortOrder' },
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
            max: { field: 'article.sortOrder' },
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
  static getArticleLangLabel(lang: LangCode, labelByLang?: ArticleDirLabelByLang): string {
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

        if (a.nodeType === b.nodeType) {
          const orderA = a.article?.sortOrder ?? 0
          const orderB = b.article?.sortOrder ?? 0
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

export { StorageService, StorageServiceDI, StorageServiceModule, ArticleContentFields }
export { StorageFileNode, StorageUploadDataItem } from './core-storage'
