import * as admin from 'firebase-admin'
import * as path from 'path'
import {
  AuthModule,
  AuthRoleType,
  AuthServiceDI,
  IdToken,
  InputValidationError,
  StorageNodeType,
  StoragePaginationInput,
  StoragePaginationResult,
  StorageService as _StorageService,
} from '../../lib'
import { ForbiddenException, Inject, Module } from '@nestjs/common'
import { Request, Response } from 'express'
import { StorageArticleNodeType, StorageNode, StoreServiceDI, StoreServiceModule } from './store'
import { removeBothEndsSlash, removeStartDirChars } from 'web-base-lib'
import { FieldValue } from '../../firestore-ex'
import { File } from '@google-cloud/storage'
import { config } from '../../config'
import dayjs = require('dayjs')

//========================================================================
//
//  Interfaces
//
//========================================================================

interface CreateArticleDirInput {
  articleNodeType?: StorageArticleNodeType
}

interface SetArticleSortOrderInput {
  insertBeforeNodePath?: string
  insertAfterNodePath?: string
}

interface StorageFileNode extends StorageNode {
  file: File
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

//========================================================================
//
//  Implementation
//
//========================================================================

class StorageService extends _StorageService<StorageNode, StorageFileNode> {
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
    const nodePaths = await this.m_toNodePaths(target)
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
  async deleteUserDir(uid: string, maxChunk = StorageService.MAX_CHUNK): Promise<void> {
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
   * 記事系のディレクトリを作成します。
   * @param dirPath
   * @param input
   */
  async createArticleDir(dirPath: string, input: CreateArticleDirInput): Promise<StorageNode> {
    let result!: StorageNode
    switch (input.articleNodeType) {
      case StorageArticleNodeType.ListBundle:
      case StorageArticleNodeType.CategoryBundle:
        result = await this.m_createArticleBundle(dirPath, input.articleNodeType)
        break
      case StorageArticleNodeType.CategoryDir:
        result = await this.m_createArticleCategory(dirPath)
        break
      case StorageArticleNodeType.ArticleDir:
        result = await this.m_createArticle(dirPath)
        break
    }
    return result
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

    // ターゲットノードの兄弟ノードを取得する関数
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

    // ターゲットノードが記事バンドル配下にあることを検証
    await this.m_validateArticleBundleDescendant(nodePath)
    // ターゲットノードを取得
    const targetNode = await this.sgetNodeByPath(nodePath)

    // ターゲットノードに設定するソート順を取得
    let newSortOrder!: number
    if (insertBeforeNodePath) {
      await this.m_validateArticleBundleDescendant(insertBeforeNodePath)
      const baseDirNode = await sgetSiblingNode('insertBeforeNodePath', insertBeforeNodePath)
      newSortOrder = baseDirNode.articleSortOrder! + 1
    } else if (insertAfterNodePath) {
      await this.m_validateArticleBundleDescendant(insertAfterNodePath)
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
   * 指定された記事系ディレクトリ＋直下のノードを取得します。
   * ※記事系ディレクトリ: 記事ルート、リストバンドル、カテゴリバンドル、カテゴリ、記事
   *
   * 引数が次のように指定された場合、
   *   + dirPath: 'users/2ZyamGpvbl4k9H9zclQ1/articles/programing'
   *
   * 次のようなノードが取得されます。
   *   + 'users/2ZyamGpvbl4k9H9zclQ1/articles/programing'
   *   + 'users/2ZyamGpvbl4k9H9zclQ1/articles/programing/js'
   *   + 'users/2ZyamGpvbl4k9H9zclQ1/articles/programing/ts'
   *
   * @param dirPath
   * @param options
   */
  async getArticleChildren(dirPath: string, options?: StoragePaginationInput): Promise<StoragePaginationResult<StorageNode>> {
    dirPath = removeBothEndsSlash(dirPath)
    await this.m_validateArticleDescendant(dirPath)

    const maxChunk = options?.maxChunk || StorageService.MAX_CHUNK
    const offset = options?.pageToken ? Number(options.pageToken) : 0

    let storeNodes: StorageNode[] = []

    const query = this.storeService.storageDao.where('dir', '==', dirPath).orderBy('articleSortOrder', 'desc').limit(maxChunk)
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
  protected async m_toNodePaths(target: ValidateAccessibleTarget): Promise<string[]> {
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
   * @param dirPath
   * @param bundleType
   */
  private async m_createArticleBundle(
    dirPath: string,
    bundleType: StorageArticleNodeType.ListBundle | StorageArticleNodeType.CategoryBundle
  ): Promise<StorageNode> {
    dirPath = removeBothEndsSlash(dirPath)
    const parentDir = removeStartDirChars(path.dirname(dirPath))

    // 指定されたディレクトリパスが記事ルート直下であることを検証
    const userRootName = config.storage.user.rootName
    const articleRootName = config.storage.article.rootName
    const reg = new RegExp(`${userRootName}/[^/]+/${articleRootName}$`)
    if (!reg.test(parentDir)) {
      throw new InputValidationError(`The article bundle must be created directly under the article root: '${dirPath}'`)
    }

    // 記事バンドルを作成
    return this.m_createArticleDir(dirPath, {
      articleNodeType: bundleType,
      articleSortOrder: StorageService.generateArticleSortOrder(),
    })
  }

  /**
   * 記事カテゴリを作成します。
   * @param dirPath
   */
  private async m_createArticleCategory(dirPath: string): Promise<StorageNode> {
    dirPath = removeBothEndsSlash(dirPath)

    // 指定ディレクトリが記事バンドル配下であることを検証
    await this.m_validateArticleBundleDescendant(dirPath)

    // 記事バンドルを作成
    return this.m_createArticleDir(dirPath, {
      articleNodeType: StorageArticleNodeType.CategoryDir,
      articleSortOrder: StorageService.generateArticleSortOrder(),
    })
  }

  /**
   * 記事を作成します。
   * 作成される記事とはディレクトリであり、記事に必要なファイルが格納されることになります。
   * @param dirPath
   */
  private async m_createArticle(dirPath: string): Promise<StorageNode> {
    dirPath = removeBothEndsSlash(dirPath)

    // 指定ディレクトリが記事バンドル配下であることを検証
    await this.m_validateArticleBundleDescendant(dirPath)

    // 引数ディレクトリの階層構造形成に必要なノードを取得
    const hierarchicalDirNodes = await this.getRequiredHierarchicalDirNodes(dirPath)
    for (const iDirNode of hierarchicalDirNodes) {
      // 指定されたディレクトリがまだ存在しないことをチェック
      if (iDirNode.path === dirPath) {
        if (iDirNode.exists) {
          throw new InputValidationError(`The specified directory already exists: '${dirPath}'`)
        }
      }
      // 祖先に記事ディレクトリが存在しないことをチェック
      if (iDirNode.articleNodeType === StorageArticleNodeType.ArticleDir) {
        throw new InputValidationError(`The article cannot be created under article.`, {
          specifiedDirPath: dirPath,
          ancestorDirPath: iDirNode.path,
        })
      }
    }

    // 記事ディレクトリを作成
    const result = await this.m_createArticleDir(dirPath, {
      articleNodeType: StorageArticleNodeType.ArticleDir,
      articleSortOrder: StorageService.generateArticleSortOrder(),
    })

    // 記事ディレクトリに記事内容のもととなるMarkdownファイルを配置
    const articleFilePath = path.join(dirPath, config.storage.article.fileName)
    await this.uploadDataItems([{ path: articleFilePath, contentType: 'text/markdown', data: '' }])

    return result
  }

  /**
   * 記事ルート配下にディレクトリを作成します。
   * @param dirPath
   * @param input
   */
  private async m_createArticleDir(
    dirPath: string,
    input: {
      articleNodeType?: StorageArticleNodeType
      articleSortOrder?: number
    }
  ): Promise<StorageNode> {
    // 指定されたパスのバリデーションチェック
    StorageService.validatePath(dirPath)
    dirPath = removeBothEndsSlash(dirPath)

    // 引数ディレクトリのパスが記事ルート配下のものか検証
    const userRootName = config.storage.user.rootName
    const articleRootName = config.storage.article.rootName
    const reg = new RegExp(`^${userRootName}/[^/]+/${articleRootName}/`)
    if (!reg.test(dirPath)) {
      throw new InputValidationError(`The specified directory path is not under article root: '${dirPath}'`)
    }

    // 引数ディレクトリの階層構造形成に必要なノードを取得
    const hierarchicalDirNodes = await this.getRequiredHierarchicalDirNodes(dirPath)

    let dirNode!: StorageNode
    for (const iDirNode of hierarchicalDirNodes) {
      // 指定されたディレクトリがまだ存在しないことをチェック
      if (iDirNode.path === dirPath) {
        if (iDirNode.exists) {
          throw new InputValidationError(`The specified directory already exists: '${dirPath}'`)
        }
        dirNode = iDirNode
      }
      // 祖先ディレクトリが存在することをチェック
      else if (!iDirNode.exists) {
        throw new InputValidationError(`The ancestor directory of the specified directory does not exist.`, {
          specifiedDirPath: dirPath,
          ancestorDirPath: iDirNode.path,
        })
      }
    }

    // ディレクトリを作成
    const nodeId = await this.storeService.storageDao.add({
      ...dirNode,
      version: FieldValue.increment(1),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...input,
    })

    // ストアに追加された最新ディレクトリを取得
    return (await this.getNodeById(nodeId))!
  }

  /**
   * 指定されたパスが記事バンドル配下であることを検証します。
   * @param nodePath
   */
  protected async m_validateArticleBundleDescendant(nodePath: string): Promise<void> {
    nodePath = removeBothEndsSlash(nodePath)
    const userRootName = config.storage.user.rootName
    const articleRootName = config.storage.article.rootName

    // 引数パスから記事バンドルのパスを取得
    const reg = new RegExp(`(?<articleBundlePath>^${userRootName}/[^/]+/${articleRootName}/[^/]+)/`)
    const regResult = reg.exec(nodePath)
    const articleBundlePath = regResult?.groups?.articleBundlePath
    if (!articleBundlePath) {
      throw new InputValidationError(`The specified path is not under article bundle: '${nodePath}'`)
    }

    // 上記で取得したパスが本当に記事バンドルか検証
    const articleBundleDir = await this.getNodeByPath(articleBundlePath)
    if (!articleBundleDir || !articleBundleDir.articleNodeType) {
      throw new InputValidationError(`The specified path is not under article bundle: '${nodePath}'`)
    }
  }

  /**
   * 指定されたパスが記事バンドル配下であることを検証します。
   * @param nodePath
   */
  protected async m_validateArticleDescendant(nodePath: string): Promise<void> {
    nodePath = removeBothEndsSlash(nodePath)
    const userRootName = config.storage.user.rootName
    const articleRootName = config.storage.article.rootName

    // 引数パスが記事ルート配下にあることを検証
    const reg = new RegExp(`^${userRootName}/[^/]+/${articleRootName}/`)
    if (!reg.test(nodePath)) {
      throw new InputValidationError(`The specified path is not under article root: '${nodePath}'`)
    }
  }
}

namespace StorageService {
  interface TreeNode {
    item: StorageNode
    parent?: TreeNode
    children: TreeNode[]
  }

  /**
   * 記事ノード配列をディレクトリ階層に従ってソートします。
   * @param nodes
   */
  export function sortArticleNodes(nodes: StorageNode[]): StorageNode[] {
    StorageService.sortNodes(nodes)

    const topTreeNodes: TreeNode[] = []
    const treeNodeDict: { [path: string]: TreeNode } = {}
    for (const node of nodes) {
      const parent = treeNodeDict[node.dir]
      const treeNode: TreeNode = { item: node, parent, children: [] }
      treeNodeDict[node.path] = treeNode
      if (parent) {
        parent.children.push(treeNode)
      } else {
        topTreeNodes.push(treeNode)
      }
    }

    nodes.splice(0)

    const sort = (treeNodes: TreeNode[]) => {
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
  export function generateArticleSortOrder(): number {
    const str = String(dayjs().valueOf()).padEnd(16, '0')
    return parseInt(str)
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
  imports: [AuthModule, StoreServiceModule],
})
class StorageServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { StorageService, StorageServiceDI, StorageServiceModule }
export { CreateArticleDirInput, SetArticleSortOrderInput, StorageFileNode }
