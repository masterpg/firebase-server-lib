import * as admin from 'firebase-admin'
import * as path from 'path'
import { AuthRoleType, AuthServiceDI, AuthServiceModule, IdToken } from './base/auth'
import { CreateStorageNodeInput, StoragePaginationInput, StoragePaginationResult, StorageService } from './base/storage'
import { ForbiddenException, Inject, Module } from '@nestjs/common'
import { Request, Response } from 'express'
import { StorageArticleNodeType, StorageNode, StorageNodeType, StoreServiceDI, StoreServiceModule } from './base/store'
import { arrayToDict, removeBothEndsSlash, removeStartDirChars, splitHierarchicalPaths } from 'web-base-lib'
import { FieldValue } from '../../firestore-ex'
import { InputValidationError } from '../base'
import { config } from '../../config'
import dayjs = require('dayjs')

//========================================================================
//
//  Interfaces
//
//========================================================================

interface CreateArticleTypeDirInput {
  dir: string
  articleNodeName: string
  articleNodeType: StorageArticleNodeType
}

interface SetArticleSortOrderInput {
  insertBeforeNodePath?: string
  insertAfterNodePath?: string
}

interface ValidateAccessibleTarget {
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
}

interface TreeStorageNode {
  item: StorageNode
  parent?: TreeStorageNode
  children: TreeStorageNode[]
}

//========================================================================
//
//  Implementation
//
//========================================================================

class AppStorageService extends StorageService {
  constructor(
    @Inject(AuthServiceDI.symbol) protected readonly authService: AuthServiceDI.type,
    @Inject(StoreServiceDI.symbol) protected readonly storeService: StoreServiceDI.type
  ) {
    super(authService, storeService)
  }

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  /**
   * ユーザーディレクトリパスを取得します。
   * @param user
   */
  getUserRootPath(user: { uid: string }): string {
    return path.join(config.storage.user.rootName, user.uid)
  }

  /**
   * 指定されたノードパスへリクエストユーザーがアクセス可能か検証します。
   * @param req
   * @param res
   * @param target
   */
  async validateAccessible(req: Request, res: Response, target: ValidateAccessibleTarget): Promise<IdToken> {
    const nodePaths = await this.m_nodeIdsToNodePaths(target)
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
        const userRootPath = this.getUserRootPath({ uid: idToken.uid })
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
    const fileNode = await this.getFileNodeById(nodeId)
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
      const userRootPath = this.getUserRootPath(user)
      if (fileNode.path.startsWith(path.join(userRootPath, '/'))) {
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
  async deleteUserDir(uid: string, maxChunk = AppStorageService.MAX_CHUNK): Promise<void> {
    /**
     * 指定されたディレクトリのストレージファイルを削除します。
     * @param userRootPath
     * @param pageToken
     */
    const deleteFiles = async (userRootPath: string, pageToken?: string) => {
      // ファイルを削除
      const bucket = admin.storage().bucket()
      const [files, apiResponse] = await bucket.getFiles({
        prefix: `users/${uid}`,
        maxResults: maxChunk,
        pageToken,
      })
      await Promise.all(files.map(file => file.delete()))
      // まだ残りのファイルがある場合、続けて削除
      const nextPageToken = (apiResponse as any)?.pageToken
      if (nextPageToken) await deleteFiles(userRootPath, nextPageToken)
    }

    /**
     * 指定されたディレクトリのストアノードを削除します。
     * @param userRootPath
     */
    const deleteFileNodes = async (userRootPath: string) => {
      // ユーザーディレクトリと配下ノードを検索
      const nodes = await this.storeService.storageDao.where('path', '>=', userRootPath).limit(maxChunk).fetch()
      // 余分に検索されてしまったノードを除去
      for (let i = 0; i < nodes.length; i++) {
        const storeNode = nodes[i]
        // ノードが「ユーザーディレクトリまたはユーザーディレクトリ配下」以外の場合は除去
        if (!(storeNode.path === userRootPath || storeNode.path.startsWith(`${userRootPath}/`))) {
          nodes.splice(i--, 1)
        }
      }
      // 検索されたノードを削除
      await Promise.all(
        nodes.map(async node => {
          await this.storeService.storageDao.delete(node.id)
        })
      )
      // まだ残りノードがある場合、続けて削除
      if (nodes.length > 0) await deleteFileNodes(userRootPath)
    }

    const userRootPath = this.getUserRootPath({ uid })
    await deleteFiles(userRootPath)
    await deleteFileNodes(userRootPath)
  }

  //--------------------------------------------------
  //  Article
  //--------------------------------------------------

  /**
   * ユーザーの記事ルートのパスを取得します。
   * @param user
   */
  getArticleRootPath(user: { uid: string }): string {
    return path.join(this.getUserRootPath(user), config.storage.article.rootName)
  }

  /**
   * 記事系ディレクトリを作成します。
   * @param input
   */
  async createArticleTypeDir(input: CreateArticleTypeDirInput): Promise<StorageNode> {
    let result!: StorageNode
    switch (input.articleNodeType) {
      case StorageArticleNodeType.ListBundle:
      case StorageArticleNodeType.CategoryBundle:
        result = await this.m_createArticleBundle(input)
        break
      case StorageArticleNodeType.Category:
        result = await this.m_createArticleCategory(input)
        break
      case StorageArticleNodeType.Article:
        result = await this.m_createArticle(input)
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
    AppStorageService.validatePath(dirPath)

    // 引数ディレクトリのパスが記事ルート配下のものか検証
    this.m_validateArticleRootDescendant(dirPath)

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

    // 引数パスがアセット配下以外の場合
    // ※アセットとその配下はディレクトリ作成が可能なので、このブロック内の検証を行う必要はない
    const reg = new RegExp(`^${userRootName}/[^/]+/${articleRootName}/(?:${assetsName}$|${assetsName}/)`)
    if (!reg.test(dirPath)) {
      // 祖先に｢記事｣が存在することを確認
      const parentPath = removeStartDirChars(path.dirname(dirPath))
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
      const nodeId = await this.storeService.storageDao.add({
        ...dirNode,
        version: FieldValue.increment(1),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      // ストアに追加された最新ディレクトリを取得
      return (await this.getNodeById(nodeId))!
    }
    // 引数ディレクトリが既に存在する場合
    else {
      if (input) {
        return await this.setDirShareSettings(dirPath, input)
      } else {
        return (await this.getNodeByPath(dirPath))!
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
    this.m_validateArticleRootDescendant(nodePath)

    const node = await this.sgetNodeByPath(nodePath)
    switch (node.nodeType) {
      case StorageNodeType.Dir:
        AppStorageService.validateDirName(newName)
        break
      // ※現時点では記事ノードにファイルはないが、今後登場するかもしれないので…
      case StorageNodeType.File:
        AppStorageService.validateFileName(newName)
        break
    }

    await this.storeService.storageDao.update({
      id: node.id,
      articleNodeName: newName,
      version: FieldValue.increment(1),
    })

    return this.sgetNodeByPath(nodePath)
  }

  /**
   * 指定されたターゲットノードにソート順を設定します。
   * `input.insertBeforeNodePath`か`input.insertAfterNodePath`どちらかに値を設定する必要があります。
   * `input.insertBeforeNodePath`を指定すると、このノードより前にターゲットノードを挿入します。
   * `input.insertAfterNodePath`を指定すると、このノードより後にターゲットノードを挿入します。
   *
   * @param nodePath
   * @param input
   */
  async setArticleSortOrder(nodePath: string, input: SetArticleSortOrderInput): Promise<StorageNode> {
    nodePath = removeBothEndsSlash(nodePath)

    /**
     * 指定ノードがソート順を設定できるノードなのか検証します。
     * 以下2つの条件を満たす場合、ソート順の設定が可能です。
     * - 指定ノードが「リストバンドル、カテゴリバンドル、カテゴリ、記事」のいずれか
     * - 指定ノードの親が「記事ルート、リストバンドル、カテゴリバンドル、カテゴリ」のいずれか
     * @param node
     */
    const validateNode = async (node: StorageNode) => {
      // 指定ノードが「リストバンドル、カテゴリバンドル、カテゴリ、記事」の場合
      if (
        node.articleNodeType === StorageArticleNodeType.ListBundle ||
        node.articleNodeType === StorageArticleNodeType.CategoryBundle ||
        node.articleNodeType === StorageArticleNodeType.Category ||
        node.articleNodeType === StorageArticleNodeType.Article
      ) {
        // 親ディレクトリが記事ルートであればOK
        const userRootName = config.storage.user.rootName
        const articleRootName = config.storage.article.rootName
        const reg = new RegExp(`${userRootName}/[^/]+/${articleRootName}$`)
        if (reg.test(node.dir)) return

        // 親ディレクトリが｢リストバンドル、カテゴリバンドル、カテゴリ｣であればOK
        const parentNode = await this.sgetNodeByPath(node.dir)
        if (
          parentNode.articleNodeType === StorageArticleNodeType.ListBundle ||
          parentNode.articleNodeType === StorageArticleNodeType.CategoryBundle ||
          parentNode.articleNodeType === StorageArticleNodeType.Category
        ) {
          return
        }

        throw new InputValidationError(`The sort order cannot be set because the parent is incorrect.`, {
          node: { path: node.path, articleNodeType: node.articleNodeType },
          parentNode: { path: parentNode.path, articleNodeType: parentNode.articleNodeType },
        })
      }
      // 指定ノードが上記以外の場合
      else {
        throw new InputValidationError(`Cannot set the sort order for the node.`, {
          node: { path: node.path, articleNodeType: node.articleNodeType },
        })
      }
    }

    /**
     * ターゲットノードの兄弟ノードを取得します。
     * @param nodeArgName
     * @param siblingNodePath
     */
    const sgetSiblingNode = async (nodeArgName: string, siblingNodePath: string) => {
      const siblingNode = await this.sgetNodeByPath(siblingNodePath)
      if (siblingNode.dir !== removeStartDirChars(path.dirname(nodePath))) {
        throw new InputValidationError(`The two nodes are not siblings.`, { nodePath, [nodeArgName]: siblingNodePath })
      }
      return siblingNode
    }

    // 挿入前ノードパス、挿入後ノードパスのどちらかが指定されていることを検証
    const { insertBeforeNodePath, insertAfterNodePath } = input
    if (!insertBeforeNodePath && !insertAfterNodePath) {
      throw new InputValidationError(`Both 'insertBeforeNodePath' and 'insertAfterNodePath' are not specified.`)
    }

    // ターゲットノードを取得
    const targetNode = await this.sgetNodeByPath(nodePath)

    // ターゲットノードがソート順を設定できるノードなのか検証
    await validateNode(targetNode)

    // ターゲットノードに設定するソート順を取得
    let newSortOrder!: number
    if (insertBeforeNodePath) {
      const baseDirNode = await sgetSiblingNode('insertBeforeNodePath', insertBeforeNodePath)
      newSortOrder = baseDirNode.articleSortOrder! + 1
    } else if (insertAfterNodePath) {
      const baseDirNode = await sgetSiblingNode('insertAfterNodePath', insertAfterNodePath)
      newSortOrder = baseDirNode.articleSortOrder! - 1
    }

    // 上記で取得したソート順をターゲットノードに設定
    await this.storeService.storageDao.update({
      id: targetNode.id,
      articleSortOrder: newSortOrder,
      version: FieldValue.increment(1),
    })

    return await this.sgetNodeById(targetNode.id)
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

    const maxChunk = options?.maxChunk || AppStorageService.MAX_CHUNK
    const offset = options?.pageToken ? Number(options.pageToken) : 0

    let storeNodes: StorageNode[] = []

    const query = this.storeService.storageDao
      .where('dir', '==', dirPath)
      .where('articleNodeType', 'in', articleTypes)
      .orderBy('articleSortOrder', 'desc')
      .limit(maxChunk)
    if (offset) {
      storeNodes = (await query.offset(offset).fetch()) as StorageNode[]
    } else {
      storeNodes = (await query.fetch()) as StorageNode[]
    }

    let nextPageToken: string | undefined
    if (storeNodes.length === 0 || storeNodes.length < maxChunk) {
      nextPageToken = undefined
    } else {
      nextPageToken = String(offset + storeNodes.length)
    }

    return { nextPageToken, list: storeNodes }
  }

  //--------------------------------------------------
  //  Overridden
  //--------------------------------------------------

  async createDir(dirPath: string, input?: CreateStorageNodeInput): Promise<StorageNode> {
    // このメソッドでは記事ルート配下にディレクトリを作成できない。
    // 例: 'users/xxx/articles'配下にディレクトリを作成できない。
    if (this.m_isArticleRootDescendants(dirPath)) {
      throw new InputValidationError(`This method 'createDir()' cannot create an article under directory '${dirPath}'.`)
    }

    return super.createDir(dirPath, input)
  }

  async createHierarchicalDirs(dirPaths: string[]): Promise<StorageNode[]> {
    // このメソッドでは記事ルート配下にディレクトリを作成できない。
    // 例: 'users/xxx/articles'配下にディレクトリを作成できない。
    for (const dirPath of splitHierarchicalPaths(...dirPaths)) {
      if (this.m_isArticleRootDescendants(dirPath)) {
        throw new InputValidationError(`This method 'createHierarchicalDirs()' cannot create an article under directory '${dirPath}'.`)
      }
    }

    return super.createHierarchicalDirs(dirPaths)
  }

  async moveDir(fromDirPath: string, toDirPath: string, input?: StoragePaginationInput): Promise<StoragePaginationResult<StorageNode>> {
    fromDirPath = removeBothEndsSlash(fromDirPath)
    toDirPath = removeBothEndsSlash(toDirPath)

    AppStorageService.validatePath(toDirPath)

    if (!input?.pageToken) {
      const fromDirNode = await this.sgetNodeByPath(fromDirPath)
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
          const toParentNode = await this.sgetNodeByPath(path.dirname(toDirPath))
          // カテゴリは｢カテゴリバンドル、カテゴリ｣へのみ移動可能。それ以外へは移動不可
          if (
            !(
              toParentNode.articleNodeType === StorageArticleNodeType.CategoryBundle ||
              toParentNode.articleNodeType === StorageArticleNodeType.Category
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
          const toParentNode = await this.sgetNodeByPath(path.dirname(toDirPath))
          // 記事は｢リストバンドル、カテゴリバンドル、カテゴリ｣へのみ移動可能。それ以外へは移動不可
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
          const toParentPath = removeStartDirChars(path.dirname(toDirPath))
          // 移動先がルートノード以外の場合
          if (toParentPath) {
            const toParentNode = await this.sgetNodeByPath(toParentPath)
            // 一般ディレクトリは｢一般ディレクトリ、記事｣へのみ移動可能。それ以外へは移動不可
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
    }

    return await super.moveDir(fromDirPath, toDirPath, input)
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  /**
   * `validateAccessible()`の引数で指定される`target`にはノードIDとノードパスが含まれます。
   * このノードIDをノードパスに変換し、全てをノードパスとして返します。
   * @param target
   */
  protected async m_nodeIdsToNodePaths(target: ValidateAccessibleTarget): Promise<string[]> {
    const nodePaths: string[] = []

    // ノードパスの取得
    for (const key of Object.keys(target)) {
      const value = (target as any)[key] as string | undefined | (string | undefined)[]
      if (/Path$|Paths$/.test(key)) {
        if (Array.isArray(value)) {
          const values = value.filter(value => Boolean(value)) as string[]
          nodePaths.push(...values)
        } else if (value) {
          nodePaths.push(value)
        }
      }
    }

    // ノードIDをノードパスに変換
    const nodeIds: string[] = []
    for (const key of Object.keys(target)) {
      const value = (target as any)[key] as string | undefined | (string | undefined)[]
      if (/Id$|Ids$/.test(key)) {
        if (Array.isArray(value)) {
          const values = value.filter(value => Boolean(value)) as string[]
          nodeIds.push(...values)
        } else if (value) {
          nodeIds.push(value)
        }
      }
    }
    const nodes = await this.getNodesByIds(nodeIds)
    nodePaths.push(...nodes.map(node => node.path))

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
  private async m_createArticleBundle(input: CreateArticleTypeDirInput): Promise<StorageNode> {
    AppStorageService.validatePath(input.dir)
    AppStorageService.validateArticleNodeName(input.articleNodeName)
    const parentPath = removeBothEndsSlash(input.dir)

    // 指定されたディレクトリパスが記事ルート直下であることを検証
    const userRootName = config.storage.user.rootName
    const articleRootName = config.storage.article.rootName
    const reg = new RegExp(`${userRootName}/[^/]+/${articleRootName}$`)
    if (!reg.test(parentPath)) {
      throw new InputValidationError(`The article bundle must be created directly under the article root.`, { input })
    }

    // 記事バンドルを作成
    const dirPath = path.join(input.dir, this.storeService.storageDao.docRef().id)
    return this.m_createArticleTypeDir(dirPath, {
      articleNodeName: input.articleNodeName,
      articleNodeType: input.articleNodeType,
      articleSortOrder: AppStorageService.generateArticleSortOrder(),
    })
  }

  /**
   * 記事カテゴリを作成します。
   * @param input
   */
  private async m_createArticleCategory(input: CreateArticleTypeDirInput): Promise<StorageNode> {
    AppStorageService.validatePath(input.dir)
    AppStorageService.validateArticleNodeName(input.articleNodeName)
    const parentPath = removeBothEndsSlash(input.dir)

    // 親ディレクトリが｢カテゴリバンドル、カテゴリ｣以外の場合、
    // カテゴリの作成はできないためエラー
    const parentNode = await this.getNodeByPath(parentPath)
    if (!parentNode) {
      throw new InputValidationError(`There is no parent directory for the category to be created.`, { parentPath })
    }
    if (!(parentNode.articleNodeType === StorageArticleNodeType.CategoryBundle || parentNode.articleNodeType === StorageArticleNodeType.Category)) {
      throw new InputValidationError(`Categories cannot be created under the specified parent.`, {
        parentNode: { path: parentNode.path, articleNodeType: parentNode.articleNodeType },
      })
    }

    // カテゴリを作成
    const dirPath = path.join(input.dir, this.storeService.storageDao.docRef().id)
    return this.m_createArticleTypeDir(dirPath, {
      articleNodeName: input.articleNodeName,
      articleNodeType: StorageArticleNodeType.Category,
      articleSortOrder: AppStorageService.generateArticleSortOrder(),
    })
  }

  /**
   * 記事を作成します。
   * 作成される記事とはディレクトリであり、記事に必要なファイルが格納されることになります。
   * @param input
   */
  private async m_createArticle(input: CreateArticleTypeDirInput): Promise<StorageNode> {
    AppStorageService.validateArticleNodeName(input.articleNodeName)
    const dirPath = path.join(input.dir, this.storeService.storageDao.docRef().id)
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
      articleSortOrder: AppStorageService.generateArticleSortOrder(),
    })

    // 記事用ディレクトリに記事のもととなるMarkdownファイルを配置
    const articleFilePath = path.join(dirPath, config.storage.article.fileName)
    await this.saveStorageFileNode({
      filePath: articleFilePath,
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
    let dirPath: string
    let hierarchicalDirNodes: (StorageNode & { exists: boolean })[]
    if (typeof dirPath_or_hierarchicalDirNodes === 'string') {
      // 指定パスのバリデーションチェック
      dirPath = dirPath_or_hierarchicalDirNodes
      AppStorageService.validatePath(dirPath)
      dirPath = removeBothEndsSlash(dirPath)
      // 引数パスが記事ルート配下のものか検証
      this.m_validateArticleRootDescendant(dirPath)
      // 引数パスの階層構造形成に必要なノードを取得
      hierarchicalDirNodes = await this.getRequiredHierarchicalDirNodes(dirPath)
    } else {
      hierarchicalDirNodes = dirPath_or_hierarchicalDirNodes
      dirPath = hierarchicalDirNodes[hierarchicalDirNodes.length - 1].path
      // 引数パスが記事ルート配下のものか検証
      this.m_validateArticleRootDescendant(dirPath)
    }

    const hierarchicalDirNodeDict = arrayToDict(hierarchicalDirNodes, 'path')
    const ancestorDirNodes = hierarchicalDirNodes.filter(node => node.path !== dirPath)

    // 引数ディレクトリがまだ存在しないことを検証
    const dirNode = hierarchicalDirNodeDict[dirPath]
    if (dirNode.exists) {
      throw new InputValidationError(`The specified directory already exists: '${dirPath}'`)
    }

    for (const iDirNode of ancestorDirNodes) {
      // 祖先ディレクトリが存在することを検証
      if (!iDirNode.exists) {
        throw new InputValidationError(`The ancestor of the specified path does not exist.`, {
          specifiedPath: dirPath,
          ancestorPath: iDirNode.path,
        })
      }
    }

    // ディレクトリを作成
    const nodeId = await this.storeService.storageDao.set({
      ...dirNode,
      id: dirNode.name,
      version: FieldValue.increment(1),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...input,
    })

    // ストアに追加された最新ディレクトリを取得
    return (await this.getNodeById(nodeId))!
  }

  /**
   * 指定されたパスが記事ルート配下のノードであることを検証します。
   * @param nodePath
   */
  protected m_validateArticleRootDescendant(nodePath: string): void {
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
   * 指定されたパスが記事ルートの配下ノードか否かを取得します。
   * @param nodePath
   */
  protected m_isArticleRootDescendants(nodePath: string): boolean {
    const userRootName = config.storage.user.rootName
    const articleRootName = config.storage.article.rootName
    const reg = new RegExp(`^${userRootName}/[^/]+/${articleRootName}/`)
    return reg.test(nodePath)
  }

  /**
   * 指定されたパスがアセットディレクトリを含めファミリーノードか否かを取得します。
   * @param nodePath
   */
  protected m_isArticleAssetsFamily(nodePath: string): boolean {
    const userRootName = config.storage.user.rootName
    const articleRootName = config.storage.article.rootName
    const assetsName = config.storage.article.assetsName
    const reg = new RegExp(`^${userRootName}/[^/]+/${articleRootName}/(?:${assetsName}$|${assetsName}/)`)
    return reg.test(nodePath)
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
    const bundle = await this.getNodeByPath(bundlePath)
    if (!bundle) return undefined
    if (!(bundle.articleNodeType === StorageArticleNodeType.ListBundle || bundle.articleNodeType === StorageArticleNodeType.CategoryBundle)) {
      return undefined
    }

    return bundle
  }

  //----------------------------------------------------------------------
  //
  //  Static
  //
  //----------------------------------------------------------------------

  /**
   * 記事ノード配列をディレクトリ階層に従ってソートします。
   * @param nodes
   */
  static sortArticleNodes(nodes: StorageNode[]): StorageNode[] {
    AppStorageService.sortNodes(nodes)

    const topTreeNodes: TreeStorageNode[] = []
    const treeNodeDict: { [path: string]: TreeStorageNode } = {}
    for (const node of nodes) {
      const parent = treeNodeDict[node.dir]
      const treeNode: TreeStorageNode = { item: node, parent, children: [] }
      treeNodeDict[node.path] = treeNode
      if (parent) {
        parent.children.push(treeNode)
      } else {
        topTreeNodes.push(treeNode)
      }
    }

    nodes.splice(0)

    const sort = (treeNodes: TreeStorageNode[]) => {
      treeNodes.sort((treeNodeA, treeNodeB) => {
        const a = treeNodeA.item
        const b = treeNodeB.item
        if (a.nodeType === b.nodeType) {
          const orderA = a.articleSortOrder ?? 0
          const orderB = b.articleSortOrder ?? 0
          if (orderA === orderB) {
            return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
          } else {
            return orderB - orderA
          }
        } else {
          return a.nodeType === StorageNodeType.Dir ? -1 : 1
        }
      })

      for (const treeNode of treeNodes) {
        nodes.push(treeNode.item)
        sort(treeNode.children)
      }
    }

    sort(topTreeNodes)

    return nodes
  }

  /**
   * 記事ソート順を生成します。
   */
  static generateArticleSortOrder(): number {
    const str = String(dayjs().valueOf()).padEnd(16, '0')
    return parseInt(str)
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
  imports: [AuthServiceModule, StoreServiceModule],
})
class AppStorageServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { AppStorageService, AppStorageServiceDI, AppStorageServiceModule }
export { CreateArticleTypeDirInput, SetArticleSortOrderInput, StorageArticleNodeType }
export {
  CreateStorageNodeInput,
  SignedUploadUrlInput,
  StorageFileNode,
  StorageNode,
  StorageNodeKeyInput,
  StorageNodeShareSettings,
  StorageNodeShareSettingsInput,
  StorageNodeType,
  StoragePaginationInput,
  StoragePaginationResult,
  StorageUploadDataItem,
} from './base/storage'
