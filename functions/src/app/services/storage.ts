import * as _path from 'path'
import * as admin from 'firebase-admin'
import {
  AuthRoleType,
  CreateArticleTypeDirInput,
  CreateStorageNodeInput,
  IdToken,
  StorageArticleNodeType,
  StorageNode,
  StorageNodeGetKeyInput,
  StorageNodeType,
  StoragePaginationInput,
  StoragePaginationResult,
} from './types'
import { AuthServiceDI, AuthServiceModule } from './base/auth'
import { ForbiddenException, Inject, Module } from '@nestjs/common'
import { RawStorageNode, StorageService } from './base/storage'
import { Request, Response } from 'express'
import { arrayToDict, removeBothEndsSlash, removeStartDirChars, splitHierarchicalPaths } from 'web-base-lib'
import { InputValidationError } from '../base'
import { SearchResponse } from '../base/elastic'
import { config } from '../../config'
import dayjs = require('dayjs')

//========================================================================
//
//  Interfaces
//
//========================================================================

interface ValidateAccessibleTarget {
  nodePath?: string
  nodePaths?: (string | undefined)[]
  dirPath?: string
  dirPaths?: (string | undefined)[]
  filePath?: string
  filePaths?: (string | undefined)[]
  node?: StorageNode
  nodes?: StorageNode[]
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

class AppStorageService extends StorageService {
  constructor(@Inject(AuthServiceDI.symbol) protected readonly authService: AuthServiceDI.type) {
    super(authService)
  }

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  /**
   * 指定されたノードパスへリクエストユーザーがアクセス可能か検証します。
   * @param req
   * @param res
   * @param target
   */
  async validateAccessible(req: Request, res: Response, target: ValidateAccessibleTarget): Promise<IdToken> {
    const nodePaths = await this.m_validateAccessibleTargetToNodePaths(target)
    const roles: AuthRoleType[] = []

    // IDトークンを取得
    const idTokenValidated = await this.authService.validateIdToken(req, res)
    if (!idTokenValidated.result) {
      throw idTokenValidated.error
    }
    const idToken = idTokenValidated.idToken!

    // 検査対象となるノードパスがない場合
    // ※バケット直下へのアクセスとなるので、管理者権限が必要
    if (!nodePaths.length) {
      roles.push(AuthRoleType.AppAdmin)
    }

    // ノードパスの中に管理者権限が必要なノードがあるか調べる
    // ※ユーザーノード以外は管理者権限が必要
    if (!roles.includes(AuthRoleType.AppAdmin)) {
      const needIsAppAdmin = nodePaths.some(nodePath => !this.m_isUserNode(nodePath))
      needIsAppAdmin && roles.push(AuthRoleType.AppAdmin)
    }

    // ユーザーノードパスへアクセス可能か検証
    if (!idToken.isAppAdmin) {
      for (const nodePath of nodePaths) {
        if (!this.m_isUserNode(nodePath)) continue
        // 指定ノードが自ユーザーの所有物でない場合
        const userRootPath = AppStorageService.getUserRootPath({ uid: idToken.uid })
        const isOwnUserNode = nodePath == userRootPath || nodePath.startsWith(`${userRootPath}/`)
        if (!isOwnUserNode) {
          throw new ForbiddenException(`The user cannot access to the node: ${JSON.stringify({ uid: idToken.uid, nodePath })}`)
        }
      }
    }

    // IDトークンをロールを含めて検証
    const validated = await this.authService.validate(idToken, res, roles)
    if (!validated.result) {
      throw validated.error
    }

    return idToken
  }

  /**
   * クライアントから指定されたファイルをサーブします。
   * @param req
   * @param res
   * @param nodeId
   */
  async serveFile(req: Request, res: Response, nodeId: string): Promise<Response> {
    // 引数のファイルノードを取得
    const fileNode = await this.getFileNode({ id: nodeId })
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

    //
    // 指定されたファイルがユーザーファイルの場合
    //
    if (this.m_isUserNode(fileNode.path)) {
      // 指定ファイルが自ユーザーの所有物である場合
      const userRootPath = AppStorageService.getUserRootPath(user)
      if (fileNode.path.startsWith(_path.join(userRootPath, '/'))) {
        return this.streamFile(req, res, fileNode)
      }
    }
    //
    // 指定されたファイルがアプリケーションファイルの場合
    //
    else {
      // 自ユーザーがアプリケーション管理者の場合
      if (user.isAppAdmin) {
        return this.streamFile(req, res, fileNode)
      }
    }

    // ファイルの読み込み権限に自ユーザーが含まれている場合
    if (share.readUIds && share.readUIds.includes(user.uid)) {
      return this.streamFile(req, res, fileNode)
    }

    return res.sendStatus(403)
  }

  /**
   * 指定されたユーザーのディレクトリを削除します。
   * このメソッドはユーザーの削除時に使用されることを想定しています。
   * @param uid
   * @param maxChunk
   */
  async deleteUserDir(uid: string, maxChunk = AppStorageService.MaxChunk): Promise<void> {
    const userRootPath = AppStorageService.getUserRootPath({ uid })
    await this.removeDir(userRootPath)
  }

  //--------------------------------------------------
  //  Article
  //--------------------------------------------------

  /**
   * 記事系ディレクトリを作成します。
   * @param input
   */
  async createArticleTypeDir(input: CreateArticleTypeDirInput): Promise<StorageNode> {
    // 作成するノードのソート順を取得
    let articleSortOrder: number
    if (typeof input.articleSortOrder === 'number') {
      articleSortOrder = input.articleSortOrder
    } else {
      articleSortOrder =
        (await this.m_getMaxArticleSortOrder({
          path: input.dir,
        })) + 1
    }

    // ディレクトリ作成
    let result!: StorageNode
    switch (input.articleNodeType) {
      case StorageArticleNodeType.ListBundle:
      case StorageArticleNodeType.CategoryBundle:
        result = await this.m_createArticleBundle({ ...input, articleSortOrder })
        break
      case StorageArticleNodeType.Category:
        result = await this.m_createArticleCategory({ ...input, articleSortOrder })
        break
      case StorageArticleNodeType.Article:
        result = await this.m_createArticle({ ...input, articleSortOrder })
        break
    }
    return result
  }

  /**
   * 記事ルート配下に一般ディレクトリを作成します。
   * @param dirPath
   * @param input
   */
  async createArticleGeneralDir(dirPath: string, input?: CreateStorageNodeInput): Promise<StorageNode> {
    AppStorageService.validateNodePath(dirPath)

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
        throw new InputValidationError(`The ancestor of the specified path does not exist.`, {
          specifiedPath: dirPath,
          ancestorPath: iDirNode.path,
        })
      }
    }

    // 引数パスがアセットとその配下以外の場合
    // ※アセットとその配下はディレクトリ作成が可能なので、このブロック内の検証を行う必要はない
    const reg = new RegExp(`^${userRootName}/[^/]+/${articleRootName}/(?:${assetsName}$|${assetsName}/)`)
    if (!reg.test(dirPath)) {
      // 祖先に｢記事｣が存在することを確認
      const parentPath = removeStartDirChars(_path.dirname(dirPath))
      let nearestArticleNodeType: StorageArticleNodeType | undefined = undefined
      for (let i = ancestorDirNodes.length - 1; i >= 0; i--) {
        const ancestorNode = ancestorDirNodes[i]
        if (ancestorNode?.articleNodeType) {
          nearestArticleNodeType = ancestorNode.articleNodeType
          break
        }
      }
      if (nearestArticleNodeType !== StorageArticleNodeType.Article) {
        throw new InputValidationError(`The specified path is not under article: '${dirPath}'`)
      }
    }

    const dirNode = hierarchicalDirNodeDict[dirPath]
    // 引数ディレクトリがまだ存在しない場合
    if (!dirNode.exists) {
      // ディレクトリを作成
      const id = AppStorageService.generateNodeId()
      const now = dayjs().toISOString()
      await this.client.update({
        index: StorageService.IndexAlias,
        id,
        body: {
          doc: {
            ...AppStorageService.toDBNode(dirNode),
            id,
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
      if (input) {
        return await this.setDirShareSettings(dirPath, input)
      } else {
        return await this.sgetNode({ path: dirPath })
      }
    }
  }

  /**
   * 記事系ノードの名前変更を行います。
   * @param nodePath
   * @param newName
   */
  async renameArticleNode(nodePath: string, newName: string): Promise<StorageNode> {
    nodePath = removeBothEndsSlash(nodePath)

    // 引数ディレクトリのパスが記事ルート配下のものか検証
    this.m_validateArticleRootUnder(nodePath)

    const node = await this.sgetNode({ path: nodePath })
    switch (node.nodeType) {
      case StorageNodeType.Dir:
        AppStorageService.validateNodeName(newName)
        break
      // ※現時点では記事ノードにファイルはないが、今後登場するかもしれないので…
      case StorageNodeType.File:
        AppStorageService.validateNodeName(newName)
        break
    }

    await this.client.update({
      index: StorageService.IndexAlias,
      id: node.id,
      body: {
        doc: {
          articleNodeName: newName,
          version: node.version + 1,
        },
      },
      refresh: true,
    })

    return this.sgetNode({ path: nodePath })
  }

  /**
   * 指定されたノードパスのノードにソート順を設定します。
   * @param user
   * @param orderNodePaths
   *   ソート順を設定するノードパスを順番に指定します。指定するノードはみな同じ親の子でなければ
   *   なりません。指定された配列の最後尾ノードのソート順には「1」が設定され、ここから先頭に向か
   *   ってソート順の値がインクリメントされます。
   */
  async setArticleSortOrder(user: { uid: string }, orderNodePaths: string[]): Promise<void> {
    if (!orderNodePaths.length) return

    // 指定されたパスのバリデーションチェック
    orderNodePaths.forEach(nodePath => StorageService.validateNodePath(nodePath))
    orderNodePaths = orderNodePaths.map(nodePath => removeBothEndsSlash(nodePath))

    // 引数ノードリストの親がみな一緒か検証
    const parentPath = _path.dirname(orderNodePaths[0])
    orderNodePaths.forEach(nodePath => {
      if (parentPath !== _path.dirname(nodePath)) {
        throw new InputValidationError(`There are multiple parents in 'orderNodePaths'.`, { orderNodePaths })
      }
    })

    // 親ディレクトリを取得
    const parentNode = await this.sgetNode({ path: parentPath })

    // 親ディレクトリが「記事ルート、リストバンドル、カテゴリバンドル、カテゴリ」以外の場合、
    // 子ノードにソート順を設定することはできない。
    if (
      !(
        parentNode.path === AppStorageService.getArticleRootPath(user) ||
        parentNode.articleNodeType === StorageArticleNodeType.ListBundle ||
        parentNode.articleNodeType === StorageArticleNodeType.CategoryBundle ||
        parentNode.articleNodeType === StorageArticleNodeType.Category
      )
    ) {
      throw new InputValidationError(`It is not possible to set the sort order for child nodes.`, {
        parent: { id: parentNode.id, path: parentNode.path, articleNodeType: parentNode.articleNodeType },
      })
    }

    // 引数ノードリストの親が持つ子ノードの数と引数ノードリストが一致するか検証
    const countResponse = await this.client.count({
      index: StorageService.IndexAlias,
      body: {
        query: {
          bool: {
            must: [{ term: { dir: parentPath } }],
            // ソート順を設定できるのは記事系ノードのみなのでフィルターする
            filter: [{ exists: { field: 'articleNodeType' } }],
          },
        },
      },
    })
    const childCount = countResponse.body.count
    if (orderNodePaths.length !== childCount) {
      throw new InputValidationError(`The number of 'orderNodePaths' does not match the number of children of the parent of 'orderNodePaths'.`, {
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
      index: StorageService.IndexAlias,
      body: {
        query: { term: { dir: parentNode.path } },
        script: {
          lang: 'painless',
          source: 'ctx._source.articleSortOrder = params[ctx._source.path]',
          params,
        },
      },
      refresh: true,
    })
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
   * @param dirPath
   * @param articleTypes
   * @param options
   */
  async getArticleChildren(
    dirPath: string,
    articleTypes: StorageArticleNodeType[],
    options?: StoragePaginationInput
  ): Promise<StoragePaginationResult<StorageNode>> {
    dirPath = removeBothEndsSlash(dirPath)
    const maxChunk = options?.maxChunk || AppStorageService.MaxChunk
    const from = options?.pageToken ? Number(options.pageToken) : 0

    const response = await this.client.search<SearchResponse<RawStorageNode>>({
      index: StorageService.IndexAlias,
      size: maxChunk,
      from,
      body: {
        query: {
          bool: {
            must: [{ term: { dir: dirPath } }, { terms: { articleNodeType: articleTypes } }],
          },
        },
        sort: [{ articleSortOrder: 'desc' }],
      },
    })
    const nodes = this.responseToNodes(response)

    let nextPageToken: string | undefined
    if (nodes.length === 0 || nodes.length < maxChunk) {
      nextPageToken = undefined
    } else {
      nextPageToken = String(from + nodes.length)
    }

    return { nextPageToken, list: nodes }
  }

  //--------------------------------------------------
  //  Overridden
  //--------------------------------------------------

  async createDir(dirPath: string, input?: CreateStorageNodeInput): Promise<StorageNode> {
    // このメソッドでは記事ルート配下にディレクトリを作成できない。
    // 例: 'users/xxx/articles'配下にディレクトリを作成できない。
    if (AppStorageService.isArticleRootUnder(dirPath)) {
      throw new InputValidationError(`This method 'createDir()' cannot create an article under directory '${dirPath}'.`)
    }

    return super.createDir(dirPath, input)
  }

  async createHierarchicalDirs(dirPaths: string[]): Promise<StorageNode[]> {
    // このメソッドでは記事ルート配下にディレクトリを作成できない。
    // 例: 'users/xxx/articles'配下にディレクトリを作成できない。
    for (const dirPath of splitHierarchicalPaths(...dirPaths)) {
      if (AppStorageService.isArticleRootUnder(dirPath)) {
        throw new InputValidationError(`This method 'createHierarchicalDirs()' cannot create an article under directory '${dirPath}'.`)
      }
    }

    return super.createHierarchicalDirs(dirPaths)
  }

  async moveDir(fromDirPath: string, toDirPath: string, input?: { maxChunk?: number }): Promise<void> {
    fromDirPath = removeBothEndsSlash(fromDirPath)
    toDirPath = removeBothEndsSlash(toDirPath)

    AppStorageService.validateNodePath(toDirPath)

    const fromDirNode = await this.sgetNode({ path: fromDirPath })
    switch (fromDirNode.articleNodeType) {
      // 移動ノードが｢リストバンドル、カテゴリバンドル｣の場合
      // ※リストバンドル、カテゴリバンドルは移動不可
      case StorageArticleNodeType.ListBundle:
      case StorageArticleNodeType.CategoryBundle: {
        throw new InputValidationError('Article bundles cannot be moved.', {
          movingNode: { path: fromDirPath, articleNodeType: fromDirNode.articleNodeType },
        })
      }
      // 移動ノードが｢カテゴリ｣の場合
      // ※カテゴリは｢カテゴリバンドル、カテゴリ｣へのみ移動可能
      case StorageArticleNodeType.Category: {
        const toParentNode = await this.sgetNode({ path: _path.dirname(toDirPath) })
        // カテゴリは｢カテゴリバンドル、カテゴリ｣へのみ移動可能。それ以外へは移動不可
        if (
          !(
            toParentNode.articleNodeType === StorageArticleNodeType.CategoryBundle || toParentNode.articleNodeType === StorageArticleNodeType.Category
          )
        ) {
          throw new InputValidationError('Categories can only be moved to category bundles or categories.', {
            movingNode: { path: fromDirNode.path, articleNodeType: fromDirNode.articleNodeType },
            toParentNode: { path: toParentNode.path, articleNodeType: toParentNode.articleNodeType },
          })
        }
        break
      }
      // 移動ノードが｢記事｣の場合
      // ※記事は｢リストバンドル、カテゴリバンドル、カテゴリ｣へのみ移動可能
      case StorageArticleNodeType.Article: {
        const toParentNode = await this.sgetNode({ path: _path.dirname(toDirPath) })
        if (
          !(
            toParentNode.articleNodeType === StorageArticleNodeType.ListBundle ||
            toParentNode.articleNodeType === StorageArticleNodeType.CategoryBundle ||
            toParentNode.articleNodeType === StorageArticleNodeType.Category
          )
        ) {
          throw new InputValidationError('Articles can only be moved to list bundles or category bundles or categories.', {
            movingNode: { path: fromDirNode.path, articleNodeType: fromDirNode.articleNodeType },
            toParentNode: { path: toParentNode.path, articleNodeType: toParentNode.articleNodeType },
          })
        }
        break
      }
      // 移動ノードが｢一般ディレクトリ｣の場合
      // ※一般ディレクトリは｢一般ディレクトリ、記事｣へのみ移動可能
      default: {
        const toParentPath = removeStartDirChars(_path.dirname(toDirPath))
        // 移動先がルートノード以外の場合
        if (toParentPath) {
          const toParentNode = await this.sgetNode({ path: toParentPath })
          if (!(!toParentNode.articleNodeType || toParentNode.articleNodeType === StorageArticleNodeType.Article)) {
            throw new InputValidationError('The general directory can only be moved to the general directory or articles.', {
              movingNode: { path: fromDirNode.path, articleNodeType: fromDirNode.articleNodeType },
              toParentNode: { path: toParentNode.path, articleNodeType: toParentNode.articleNodeType },
            })
          }
        }
        break
      }
    }

    //
    // ディレクトリの移動を実行
    //
    await super.moveDir(fromDirPath, toDirPath, input)

    //
    // 移動ディレクトリにソート順を設定
    //
    // 移動ディレクトリが｢カテゴリ、記事｣の場合
    // ※1 リストバンドル、カテゴリバンドルは移動できないので対象外
    // ※2 記事系ディレクトリ以外のディレクトリにソート順は設定されないので対象外
    if (fromDirNode.articleNodeType === StorageArticleNodeType.Category || fromDirNode.articleNodeType === StorageArticleNodeType.Article) {
      const articleSortOrder = await this.m_getNewArticleSortOrder({ path: toDirPath })
      await this.client.update({
        index: StorageService.IndexAlias,
        id: fromDirNode.id,
        body: {
          doc: {
            articleSortOrder,
          },
        },
        refresh: true,
      })
    }
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  /**
   * `validateAccessible()`の引数で指定される`target`にはノードパス、ノード、ノードリストが含まれます。
   * targetがノードまたはノードリストの場合はこれらをノードパスに変換し、全てをノードパスとして返します。
   * @param target
   */
  protected async m_validateAccessibleTargetToNodePaths(target: ValidateAccessibleTarget): Promise<string[]> {
    const nodePaths: string[] = []

    // ノードパスの取得
    for (const key of Object.keys(target)) {
      if (/Path$|Paths$/.test(key)) {
        const value = (target as any)[key] as string | undefined | (string | undefined)[]
        if (Array.isArray(value)) {
          const values = value.filter(value => Boolean(value)) as string[]
          nodePaths.push(...values)
        } else if (value) {
          nodePaths.push(value)
        }
      }
    }

    // ノードリストをノードパスに変換
    for (const key of Object.keys(target)) {
      if (/node$|nodes$/.test(key)) {
        const value = (target as any)[key] as StorageNode | StorageNode[]
        if (Array.isArray(value)) {
          const values = value.map(node => node.path)
          nodePaths.push(...values)
        } else if (value) {
          nodePaths.push(value.path)
        }
      }
    }

    return nodePaths
  }

  /**
   * 指定されたノードパスがユーザーノードのものか判定します。
   * @param nodePath
   */
  private m_isUserNode(nodePath: string): boolean {
    return nodePath.startsWith(`${config.storage.user.rootName}/`)
  }

  //--------------------------------------------------
  //  Article
  //--------------------------------------------------

  /**
   * 記事バンドルを作成します。
   * @param input
   */
  private async m_createArticleBundle(input: CreateArticleTypeDirInput & { articleSortOrder: number }): Promise<StorageNode> {
    AppStorageService.validateNodePath(input.dir)
    AppStorageService.validateArticleNodeName(input.articleNodeName)
    const parentPath = removeBothEndsSlash(input.dir)

    // 指定されたディレクトリパスが記事ルート直下であることを検証
    const userRootName = config.storage.user.rootName
    const articleRootName = config.storage.article.rootName
    const reg = new RegExp(`${userRootName}/[^/]+/${articleRootName}$`)
    if (!reg.test(parentPath)) {
      const { dir, articleNodeType, articleNodeName } = input
      throw new InputValidationError(`The article bundle must be created directly under the article root.`, {
        input: { dir, articleNodeType, articleNodeName },
      })
    }

    // 記事バンドルを作成
    const dirPath = _path.join(input.dir, AppStorageService.generateNodeId())
    return this.m_createArticleTypeDir(dirPath, {
      articleNodeName: input.articleNodeName,
      articleNodeType: input.articleNodeType,
      articleSortOrder: input.articleSortOrder,
    })
  }

  /**
   * 記事カテゴリを作成します。
   * @param input
   */
  private async m_createArticleCategory(input: CreateArticleTypeDirInput & { articleSortOrder: number }): Promise<StorageNode> {
    AppStorageService.validateNodePath(input.dir)
    AppStorageService.validateArticleNodeName(input.articleNodeName)
    const parentPath = removeBothEndsSlash(input.dir)

    // 親ディレクトリが｢カテゴリバンドル、カテゴリ｣以外の場合、
    // カテゴリの作成はできないためエラー
    const parentNode = await this.getNode({ path: parentPath })
    if (!parentNode) {
      throw new InputValidationError(`There is no parent directory for the category to be created.`, { parentPath })
    }
    if (!(parentNode.articleNodeType === StorageArticleNodeType.CategoryBundle || parentNode.articleNodeType === StorageArticleNodeType.Category)) {
      throw new InputValidationError(`Categories cannot be created under the specified parent.`, {
        parentNode: { path: parentNode.path, articleNodeType: parentNode.articleNodeType },
      })
    }

    // カテゴリを作成
    const dirPath = _path.join(input.dir, AppStorageService.generateNodeId())
    return this.m_createArticleTypeDir(dirPath, {
      articleNodeName: input.articleNodeName,
      articleNodeType: StorageArticleNodeType.Category,
      articleSortOrder: input.articleSortOrder,
    })
  }

  /**
   * 記事を作成します。
   * 作成される記事とはディレクトリであり、記事に必要なファイルが格納されることになります。
   * @param input
   */
  private async m_createArticle(input: CreateArticleTypeDirInput & { articleSortOrder: number }): Promise<StorageNode> {
    AppStorageService.validateArticleNodeName(input.articleNodeName)
    const dirPath = _path.join(input.dir, AppStorageService.generateNodeId())
    const parentPath = removeBothEndsSlash(input.dir)

    // 引数ディレクトリの階層構造形成に必要なノードを取得
    const hierarchicalDirNodes = await this.getRequiredHierarchicalDirNodes(dirPath)
    const hierarchicalDirNodeDict = arrayToDict(hierarchicalDirNodes, 'path')

    // 親ディレクトリが｢リストバンドル、カテゴリバンドル、カテゴリ｣以外の場合、
    // カテゴリの作成はできないためエラー
    const parentNode = hierarchicalDirNodeDict[parentPath]
    if (!parentNode.exists) {
      throw new InputValidationError(`There is no parent directory for the article to be created.`, { parentPath })
    }
    if (
      !(
        parentNode.articleNodeType === StorageArticleNodeType.ListBundle ||
        parentNode.articleNodeType === StorageArticleNodeType.CategoryBundle ||
        parentNode.articleNodeType === StorageArticleNodeType.Category
      )
    ) {
      throw new InputValidationError(`Articles cannot be created under the specified parent.`, {
        parentNode: { path: parentNode.path, articleNodeType: parentNode.articleNodeType },
      })
    }

    // 祖先に記事が存在しないことをチェック
    for (const iDirNode of hierarchicalDirNodes.filter(node => node.path !== dirPath)) {
      if (iDirNode.articleNodeType === StorageArticleNodeType.Article) {
        throw new InputValidationError(`The article cannot be created under article.`, {
          specifiedDirPath: dirPath,
          ancestorDirPath: iDirNode.path,
        })
      }
    }

    // 記事用ディレクトリを作成
    const result = await this.m_createArticleTypeDir(hierarchicalDirNodes, {
      articleNodeName: input.articleNodeName,
      articleNodeType: StorageArticleNodeType.Article,
      articleSortOrder: input.articleSortOrder,
    })

    // 記事用ディレクトリに記事のもととなるMarkdownファイルを配置
    const articleFilePath = _path.join(dirPath, config.storage.article.fileName)
    await this.saveStorageFileNode({
      fileNodePath: articleFilePath,
      isArticleFile: true,
      dataParams: {
        data: '',
        options: { contentType: 'text/markdown' },
      },
    })

    return result
  }

  /**
   * 記事ルート配下にディレクトリを作成します。
   * @param dirPath
   * @param input
   */
  private async m_createArticleTypeDir(
    dirPath: string,
    input: {
      articleNodeName: string
      articleNodeType: StorageArticleNodeType
      articleSortOrder: number
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
      articleNodeName: string
      articleNodeType: StorageArticleNodeType
      articleSortOrder: number
    }
  ): Promise<StorageNode>

  private async m_createArticleTypeDir(
    dirPath_or_hierarchicalDirNodes: string | (StorageNode & { exists: boolean })[],
    input: {
      articleNodeName: string
      articleNodeType: StorageArticleNodeType
      articleSortOrder: number
    }
  ): Promise<StorageNode> {
    // 作成するディレクトリのパスと、その階層構造を形成するのに必要なノードを取得
    let dirPath: string
    let hierarchicalDirNodes: (StorageNode & { exists: boolean })[]
    if (typeof dirPath_or_hierarchicalDirNodes === 'string') {
      // 指定パスのバリデーションチェック
      dirPath = dirPath_or_hierarchicalDirNodes
      AppStorageService.validateNodePath(dirPath)
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
      throw new InputValidationError(`The specified directory already exists: '${dirPath}'`)
    }

    for (const iDirNode of ancestorDirNodes) {
      // 作成しようとするディレクトリの祖先が存在することを検証
      if (!iDirNode.exists) {
        throw new InputValidationError(`The ancestor of the specified path does not exist.`, {
          specifiedPath: dirPath,
          ancestorPath: iDirNode.path,
        })
      }
    }

    // ディレクトリを作成
    const id = dirNode.name
    const now = dayjs().toISOString()
    await this.client.update({
      index: StorageService.IndexAlias,
      id,
      body: {
        doc: {
          ...AppStorageService.toDBNode(dirNode),
          id,
          version: 1,
          createdAt: now,
          updatedAt: now,
          ...input,
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
      throw new InputValidationError(`The specified path is not under article root: '${nodePath}'`)
    }
  }

  /**
   * 指定されたパスが所属する記事バンドルを取得します。
   * @param nodePath
   */
  protected async m_getBelongToArticleBundle(nodePath: string): Promise<StorageNode | undefined> {
    nodePath = removeBothEndsSlash(nodePath)
    const userRootName = config.storage.user.rootName
    const articleRootName = config.storage.article.rootName

    // 引数パスから記事バンドルのパスを取得
    const reg = new RegExp(`(?<bundlePath>^${userRootName}/[^/]+/${articleRootName}/[^/]+)/`)
    const regResult = reg.exec(nodePath)
    const bundlePath = regResult?.groups?.bundlePath
    if (!bundlePath) {
      return undefined
    }

    // 上記で取得したパスから記事バンドルを取得
    const bundle = await this.getNode({ path: bundlePath })
    if (!bundle) return undefined
    if (!(bundle.articleNodeType === StorageArticleNodeType.ListBundle || bundle.articleNodeType === StorageArticleNodeType.CategoryBundle)) {
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
      throw new InputValidationError(`Either the 'id' or the 'path' must be specified.`)
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
      index: StorageService.IndexAlias,
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
            max: { field: 'articleSortOrder' },
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
      throw new InputValidationError(`Either the 'id' or the 'path' must be specified.`)
    }

    let dirPath: string
    if (dirKey.id) {
      const dirNode = await this.sgetNode({ id: dirKey.id })
      if (dirNode.nodeType !== StorageNodeType.Dir) {
        throw new InputValidationError(`The specified node is not a directory.`, { input: dirKey })
      }
      dirPath = dirNode.path
    } else {
      dirPath = removeBothEndsSlash(dirKey.path)
    }

    const res = await this.client.search({
      index: StorageService.IndexAlias,
      size: 0,
      body: {
        query: {
          term: { dir: dirPath },
        },
        aggs: {
          maxArticleSortOrder: {
            max: { field: 'articleSortOrder' },
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
   * 指定されたユーザーのホームディレクトリを取得します。
   * @param user
   */
  static getUserRootPath(user: { uid: string }): string {
    return _path.join(config.storage.user.rootName, user.uid)
  }

  /**
   * ユーザーの記事ルートのパスを取得します。
   * @param user
   */
  static getArticleRootPath(user: { uid: string }): string {
    return _path.join(this.getUserRootPath(user), config.storage.article.rootName)
  }

  /**
   * 記事用のアッセトディレクトリのパスを取得します。
   * @param user
   */
  static getArticleAssetPath(user: { uid: string }): string {
    return _path.join(this.getArticleRootPath(user), config.storage.article.assetsName)
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
   * 指定されたパスがアセットディレクトリを含めたファミリーノードか否かを取得します。
   * @param nodePath
   */
  static isArticleAssetFamily(nodePath: string): boolean {
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
  static sortNodes<NODE extends StorageNode>(nodes: NODE[]): NODE[] {
    const sortChildren = (children: TreeStorageNode<NODE>[]) => {
      children.sort((treeNodeA, treeNodeB) => {
        const a = treeNodeA.item
        const b = treeNodeB.item
        if (a.nodeType === b.nodeType) {
          const orderA = a.articleSortOrder ?? 0
          const orderB = b.articleSortOrder ?? 0
          if (orderA === orderB) {
            const nameA = a.articleNodeName || a.name
            const nameB = b.articleNodeName || b.name
            return nameA < nameB ? -1 : nameA > nameB ? 1 : 0
          } else {
            return orderB - orderA
          }
        } else {
          return a.nodeType === StorageNodeType.Dir ? -1 : 1
        }
      })
    }

    const sort = (treeNodes: TreeStorageNode<NODE>[]) => {
      for (const treeNode of treeNodes) {
        nodes.push(treeNode.item)
        this.isArticleRootFamily(treeNode.item.path) && sortChildren(treeNode.children)
        sort(treeNode.children)
      }
    }

    // 一旦通常のディレクトリ階層用のソートを行う
    StorageService.sortNodes(nodes)

    // ノード配列をツリー構造に変換し、トップレベルのノードのみ配列に抽出する
    // ※トップレベルノード = 親が存在しないノード
    const topTreeNodes: TreeStorageNode<NODE>[] = []
    const treeNodeDict: { [path: string]: TreeStorageNode<NODE> } = {}
    for (const node of nodes) {
      const parent = treeNodeDict[node.dir]
      const treeNode: TreeStorageNode<NODE> = { item: node, parent, children: [] }
      treeNodeDict[node.path] = treeNode
      if (parent) {
        parent.children.push(treeNode)
      } else {
        topTreeNodes.push(treeNode)
      }
    }

    // 引数ノード配列を一旦クリアする
    // この後のソートで並べ替えられたノードがこの配列に設定される
    nodes.splice(0)

    // トップレベルノードが記事ルート配下のものである場合、記事系ソートを行う
    this.isArticleRootUnder(topTreeNodes[0].item.path) && sortChildren(topTreeNodes)

    // トップレベルノードの配下にあるノードのソートを行う
    sort(topTreeNodes)

    return nodes
  }

  /**
   * 記事ノード名の検証を行います。
   * @param articleNodeName
   */
  static validateArticleNodeName(articleNodeName?: string) {}
}

namespace AppStorageServiceDI {
  export const symbol = Symbol(AppStorageService.name)
  export const provider = {
    provide: symbol,
    useClass: AppStorageService,
  }
  export type type = AppStorageService
}

@Module({
  providers: [AppStorageServiceDI.provider],
  exports: [AppStorageServiceDI.provider],
  imports: [AuthServiceModule],
})
class AppStorageServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { AppStorageService, AppStorageServiceDI, AppStorageServiceModule }
export { StorageFileNode, StorageUploadDataItem } from './base/storage'
