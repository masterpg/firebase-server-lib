import * as _path from 'path'
import { AuthServiceDI, AuthServiceModule } from './base/auth'
import {
  CreateArticleTypeDirInput,
  CreateStorageNodeInput,
  SaveArticleSrcMasterFileResult,
  StorageArticleDirSettings,
  StorageArticleDirType,
  StorageArticleFileSettings,
  StorageArticleFileType,
  StorageArticleSettings,
  StorageNode,
  StorageNodeGetKeyInput,
  StorageNodeShareSettingsInput,
  StorageNodeType,
  StoragePaginationInput,
  StoragePaginationResult,
} from './types'
import { ElasticSearchResponse, ElasticTimestamp } from '../base/elastic'
import { Inject, Module } from '@nestjs/common'
import { arrayToDict, pickProps, removeBothEndsSlash, removeStartDirChars, splitHierarchicalPaths } from 'web-base-lib'
import { AppError } from '../base'
import { CoreStorageService } from './base/core-storage'
import { File } from '@google-cloud/storage'
import { config } from '../../config'
import { merge } from 'lodash'
import dayjs = require('dayjs')

//========================================================================
//
//  Interfaces
//
//========================================================================

interface StorageFileNode extends StorageNode {
  file: File
}

interface DBStorageNode extends Omit<StorageNode, 'article' | 'createdAt' | 'updatedAt'>, ElasticTimestamp {
  article?: {
    dir?: StorageArticleDirSettings
    file?: StorageArticleFileSettings
  }
}

interface TreeStorageNode<NODE extends StorageNode = StorageNode> {
  item: NODE
  parent?: TreeStorageNode<NODE>
  children: TreeStorageNode<NODE>[]
}

const IndexDefinition = merge(CoreStorageService.IndexDefinition, {
  mappings: {
    properties: {
      article: {
        properties: {
          dir: {
            properties: {
              name: {
                type: 'keyword',
                fields: {
                  text: {
                    type: 'text',
                    analyzer: 'kuromoji_analyzer',
                  },
                },
              },
              type: {
                type: 'keyword',
              },
              sortOrder: {
                type: 'long',
              },
            },
          },
          file: {
            properties: {
              type: {
                type: 'keyword',
              },
            },
          },
          textContent: {
            type: 'text',
            analyzer: 'kuromoji_analyzer',
          },
        },
      },
    },
  },
})

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
    return [...super.excludeNodeFields, 'article.textContent']
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
   * @param input
   */
  async createArticleTypeDir(input: CreateArticleTypeDirInput): Promise<StorageNode> {
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
      case StorageArticleDirType.ListBundle:
      case StorageArticleDirType.TreeBundle:
        result = await this.m_createArticleBundle({ ...input, sortOrder })
        break
      case StorageArticleDirType.Category:
        result = await this.m_createArticleCategory({ ...input, sortOrder })
        break
      case StorageArticleDirType.Article:
        result = await this.m_createArticle({ ...input, sortOrder })
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
      if (nearestArticleDirType !== StorageArticleDirType.Article) {
        throw new AppError(`The specified path is not under article: '${dirPath}'`)
      }
    }

    const dirNode = hierarchicalDirNodeDict[dirPath]
    // 引数ディレクトリがまだ存在しない場合
    if (!dirNode.exists) {
      // ディレクトリを作成
      const id = StorageService.generateNodeId()
      const now = dayjs().toISOString()
      await this.client.update({
        index: CoreStorageService.IndexAlias,
        id,
        body: {
          doc: {
            ...this.toDBStorageNode(dirNode),
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
   * 記事系ディレクトリの名前変更を行います。
   * @param dirPath
   * @param newName
   */
  async renameArticleDir(dirPath: string, newName: string): Promise<StorageNode> {
    dirPath = removeBothEndsSlash(dirPath)

    StorageService.validateNodeName(newName)

    // 引数ディレクトリのパスが実際にディレクトリか検証
    const dirNode = await this.sgetNode({ path: dirPath })
    if (dirNode.nodeType !== StorageNodeType.Dir) {
      throw new AppError(`The specified path is not a directory.`, { specifiedPath: dirPath })
    }

    // 引数ディレクトリのパスが記事ルート配下のものか検証
    this.m_validateArticleRootUnder(dirPath)

    await this.client.update({
      index: CoreStorageService.IndexAlias,
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
        parentNode.path === StorageService.toArticleRootPath(user) ||
        parentArticleDirType === StorageArticleDirType.ListBundle ||
        parentArticleDirType === StorageArticleDirType.TreeBundle ||
        parentArticleDirType === StorageArticleDirType.Category
      )
    ) {
      throw new AppError(`It is not possible to set the sort order for child nodes.`, {
        parent: pickProps(parentNode, ['id', 'path', 'article']),
      })
    }

    // 引数ノードリストの親が持つ子ノードの数と引数ノードリストが一致するか検証
    const countResponse = await this.client.count({
      index: CoreStorageService.IndexAlias,
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
      index: CoreStorageService.IndexAlias,
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
   * 記事ソースを保存します。
   * @param articleDirPath
   * @param srcContent
   * @param textContent
   */
  async saveArticleSrcMasterFile(articleDirPath: string, srcContent: string, textContent: string): Promise<SaveArticleSrcMasterFileResult> {
    const draftNode = await this.saveArticleSrcDraftFile(articleDirPath, '')
    const masterNodePath = StorageService.toArticleSrcMasterPath(articleDirPath)
    let masterNode: StorageNode = await this.saveGCSFileAndFileNode(masterNodePath, srcContent, undefined, { idempotent: true })

    // 全文検索用のテキストコンテンツを設定
    await this.client.update({
      index: CoreStorageService.IndexAlias,
      id: masterNode.id,
      body: {
        doc: {
          article: {
            textContent,
          },
          updatedAt: dayjs().toISOString(),
          version: masterNode.version + 1,
        },
      },
      refresh: true,
    })
    masterNode = await this.sgetNode(masterNode)

    return { master: masterNode, draft: draftNode }
  }

  /**
   * 記事ソースの下書きファイルを保存します。
   * @param articleDirPath
   * @param srcContent
   */
  async saveArticleSrcDraftFile(articleDirPath: string, srcContent: string): Promise<StorageNode> {
    const draftNodePath = await StorageService.toArticleSrcDraftPath(articleDirPath)
    return this.saveGCSFileAndFileNode(draftNodePath, srcContent)
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
   * @param types
   * @param options
   */
  async getArticleChildren(
    dirPath: string,
    types: StorageArticleDirType[],
    options?: StoragePaginationInput
  ): Promise<StoragePaginationResult<StorageNode>> {
    dirPath = removeBothEndsSlash(dirPath)
    const maxChunk = options?.maxChunk || StorageService.MaxChunk
    const from = options?.pageToken ? Number(options.pageToken) : 0

    const response = await this.client.search<ElasticSearchResponse<DBStorageNode>>({
      index: CoreStorageService.IndexAlias,
      size: maxChunk,
      from,
      body: {
        query: {
          bool: {
            must: [{ term: { dir: dirPath } }, { terms: { 'article.dir.type': types } }],
          },
        },
        sort: [{ 'article.dir.sortOrder': 'desc' }],
      },
      _source_includes: this.includeNodeFields,
      _source_excludes: this.excludeNodeFields,
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
    if (StorageService.isArticleRootUnder(dirPath)) {
      throw new AppError(`This method 'createDir()' cannot create an article under directory '${dirPath}'.`)
    }

    return super.createDir(dirPath, input)
  }

  async createHierarchicalDirs(dirPaths: string[]): Promise<StorageNode[]> {
    // このメソッドでは記事ルート配下にディレクトリを作成できない。
    // 例: 'users/xxx/articles'配下にディレクトリを作成できない。
    for (const dirPath of splitHierarchicalPaths(...dirPaths)) {
      if (StorageService.isArticleRootUnder(dirPath)) {
        throw new AppError(`This method 'createHierarchicalDirs()' cannot create an article under directory '${dirPath}'.`)
      }
    }

    return super.createHierarchicalDirs(dirPaths)
  }

  async moveDir(fromDirPath: string, toDirPath: string, input?: { maxChunk?: number }): Promise<void> {
    fromDirPath = removeBothEndsSlash(fromDirPath)
    toDirPath = removeBothEndsSlash(toDirPath)

    StorageService.validateNodePath(toDirPath)

    const fromDirNode = await this.sgetNode({ path: fromDirPath })
    const fromArticleDirType = fromDirNode.article?.dir?.type
    switch (fromDirNode.article?.dir?.type) {
      // 移動ノードがバンドルの場合
      // ※バンドルは移動不可
      case StorageArticleDirType.ListBundle:
      case StorageArticleDirType.TreeBundle: {
        throw new AppError('Article bundles cannot be moved.', {
          movingNode: pickProps(fromDirNode, ['id', 'path', 'article']),
        })
      }
      // 移動ノードが｢カテゴリ｣の場合
      // ※カテゴリは｢ツリーバンドル、カテゴリ｣へのみ移動可能
      case StorageArticleDirType.Category: {
        const toParentNode = await this.sgetNode({ path: _path.dirname(toDirPath) })
        const toParentArticleDirType = toParentNode.article?.dir?.type
        // カテゴリは｢ツリーバンドル、カテゴリ｣へのみ移動可能。それ以外へは移動不可
        if (!(toParentArticleDirType === StorageArticleDirType.TreeBundle || toParentArticleDirType === StorageArticleDirType.Category)) {
          throw new AppError('Categories can only be moved to category bundles or categories.', {
            movingNode: pickProps(fromDirNode, ['id', 'path', 'article']),
            toParentNode: pickProps(toParentNode, ['id', 'path', 'article']),
          })
        }
        break
      }
      // 移動ノードが記事ディレクトリの場合
      // ※記事ディレクトリは｢リストバンドル、ツリーバンドル、カテゴリ｣へのみ移動可能
      case StorageArticleDirType.Article: {
        const toParentNode = await this.sgetNode({ path: _path.dirname(toDirPath) })
        const toParentArticleDirType = toParentNode.article?.dir?.type
        if (
          !(
            toParentArticleDirType === StorageArticleDirType.ListBundle ||
            toParentArticleDirType === StorageArticleDirType.TreeBundle ||
            toParentArticleDirType === StorageArticleDirType.Category
          )
        ) {
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
          if (!(!toParentArticleDirType || toParentArticleDirType === StorageArticleDirType.Article)) {
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
    await super.moveDir(fromDirPath, toDirPath, input)

    //
    // 移動ディレクトリにソート順を設定
    //
    // 移動ディレクトリが｢カテゴリディレクトリ、記事ディレクトリ｣の場合
    // ※1 バンドルは移動できないので対象外
    // ※2 記事系ディレクトリ以外のディレクトリにソート順は設定されないので対象外
    if (fromArticleDirType === StorageArticleDirType.Category || fromArticleDirType === StorageArticleDirType.Article) {
      const sortOrder = await this.m_getNewArticleSortOrder({ path: toDirPath })
      await this.client.update({
        index: CoreStorageService.IndexAlias,
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

  protected dirPathToStorageNode(dirPath: string): StorageNode {
    return {
      ...super.dirPathToStorageNode(dirPath),
    }
  }

  protected toStorageNode(dbNode: DBStorageNode): StorageNode {
    const result: StorageNode = { ...super.toStorageNode(dbNode) }
    if (dbNode.article?.dir) {
      result.article = {
        dir: {
          name: dbNode.article.dir.name,
          type: dbNode.article.dir.type,
          sortOrder: dbNode.article.dir.sortOrder ?? null,
        },
      }
    } else if (dbNode.article?.file) {
      result.article = {
        file: {
          type: dbNode.article.file.type,
        },
      }
    }
    return result
  }

  protected toBaseDBStorageNode(
    input: { id: string; nodeType: StorageNodeType; path: string; share?: StorageNodeShareSettingsInput | null },
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
    } else if (existing?.article?.file) {
      result.article = {
        file: {
          type: existing.article.file.type,
        },
      }
    }
    return result
  }

  protected toDBStorageNode(node: StorageNode): DBStorageNode {
    const result = { ...super.toDBStorageNode(node) }
    if (node.article?.dir) {
      result.article = { dir: pickProps(node.article.dir, ['name', 'type', 'sortOrder']) }
    } else if (node.article?.file) {
      result.article = { file: pickProps(node.article.file, ['type']) }
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
   */
  private async m_createArticleBundle(input: CreateArticleTypeDirInput & { sortOrder: number }): Promise<StorageNode> {
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
    const dirPath = _path.join(input.dir, StorageService.generateNodeId())
    return this.m_createArticleTypeDir(dirPath, {
      name: input.name,
      type: input.type,
      sortOrder: input.sortOrder,
    })
  }

  /**
   * カテゴリディレクトリを作成します。
   * @param input
   */
  private async m_createArticleCategory(input: CreateArticleTypeDirInput & { sortOrder: number }): Promise<StorageNode> {
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
    if (!(parentArticleDirType === StorageArticleDirType.TreeBundle || parentArticleDirType === StorageArticleDirType.Category)) {
      throw new AppError(`Categories cannot be created under the specified parent.`, {
        parentNode: pickProps(parentNode, ['id', 'path', 'article']),
      })
    }

    // カテゴリを作成
    const dirPath = _path.join(input.dir, StorageService.generateNodeId())
    return this.m_createArticleTypeDir(dirPath, {
      name: input.name,
      type: StorageArticleDirType.Category,
      sortOrder: input.sortOrder,
    })
  }

  /**
   * 記事ディレクトリを作成します。
   * ※記事ディレクトリには記事に必要なファイルが格納されることになります。
   * @param input
   */
  private async m_createArticle(input: CreateArticleTypeDirInput & { sortOrder: number }): Promise<StorageNode> {
    StorageService.validateArticleDirName(input.name)
    const dirPath = _path.join(input.dir, StorageService.generateNodeId())
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
    if (
      !(
        parentArticleDirType === StorageArticleDirType.ListBundle ||
        parentArticleDirType === StorageArticleDirType.TreeBundle ||
        parentArticleDirType === StorageArticleDirType.Category
      )
    ) {
      throw new AppError(`Articles cannot be created under the specified parent.`, {
        parentNode: pickProps(parentNode, ['id', 'path', 'article']),
      })
    }

    // 祖先に記事ディレクトリが存在しないことをチェック
    for (const iDirNode of hierarchicalDirNodes.filter(node => node.path !== dirPath)) {
      if (iDirNode.article?.dir?.type === StorageArticleDirType.Article) {
        throw new AppError(`The article cannot be created under article.`, {
          specifiedDirPath: dirPath,
          ancestorDirPath: iDirNode.path,
        })
      }
    }

    // 記事ディレクトリを作成
    const result = await this.m_createArticleTypeDir(hierarchicalDirNodes, {
      name: input.name,
      type: StorageArticleDirType.Article,
      sortOrder: input.sortOrder,
    })

    // 記事ディレクトリに記事ソースと下書きファイルを配置
    const masterFileItem = {
      path: _path.join(dirPath, config.storage.article.srcMasterFileName),
      article: {
        file: {
          type: StorageArticleFileType.Master,
        },
      } as StorageArticleSettings,
    }
    const draftFileItem = {
      path: _path.join(dirPath, config.storage.article.srcDraftFileName),
      article: {
        file: {
          type: StorageArticleFileType.Draft,
        },
      } as StorageArticleSettings,
    }
    await Promise.all(
      [masterFileItem, draftFileItem].map(async item => {
        const fileNode = await this.saveGCSFileAndFileNode(item.path, '', { contentType: 'text/markdown' })
        await this.client.update({
          index: CoreStorageService.IndexAlias,
          id: fileNode.id,
          body: {
            doc: {
              article: item.article,
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
   */
  private async m_createArticleTypeDir(
    dirPath: string,
    input: {
      name: string
      type: StorageArticleDirType
      sortOrder: number
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
      name: string
      type: StorageArticleDirType
      sortOrder: number
    }
  ): Promise<StorageNode>

  private async m_createArticleTypeDir(
    dirPath_or_hierarchicalDirNodes: string | (StorageNode & { exists: boolean })[],
    input: {
      name: string
      type: StorageArticleDirType
      sortOrder: number
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
    const now = dayjs().toISOString()
    await this.client.update({
      index: CoreStorageService.IndexAlias,
      id,
      body: {
        doc: {
          ...this.toDBStorageNode(dirNode),
          id,
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
    if (!(bundleArticleDirTyp === StorageArticleDirType.ListBundle || bundleArticleDirTyp === StorageArticleDirType.TreeBundle)) {
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
      index: CoreStorageService.IndexAlias,
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
      if (dirNode.nodeType !== StorageNodeType.Dir) {
        throw new AppError(`The specified node is not a directory.`, { input: dirKey })
      }
      dirPath = dirNode.path
    } else {
      dirPath = removeBothEndsSlash(dirKey.path)
    }

    const res = await this.client.search({
      index: CoreStorageService.IndexAlias,
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

  static readonly IndexDefinition = IndexDefinition

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
   * 記事ソースのマスターファイルパスを取得します。
   * @param articleDirPath 記事ディレクトリパス
   */
  static toArticleSrcMasterPath(articleDirPath: string): string {
    articleDirPath = removeStartDirChars(articleDirPath)
    return _path.join(articleDirPath, config.storage.article.srcMasterFileName)
  }

  /**
   * 記事ソースの下書きファイルパスを取得します。
   * @param articleDirPath 記事ディレクトリパス
   */
  static toArticleSrcDraftPath(articleDirPath: string): string {
    articleDirPath = removeStartDirChars(articleDirPath)
    return _path.join(articleDirPath, config.storage.article.srcDraftFileName)
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

        if (a.article?.file?.type === StorageArticleFileType.Master) return -1
        if (b.article?.file?.type === StorageArticleFileType.Master) return 1
        if (a.article?.file?.type === StorageArticleFileType.Draft) return -1
        if (b.article?.file?.type === StorageArticleFileType.Draft) return 1

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
          return a.nodeType === StorageNodeType.Dir ? -1 : 1
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
export { StorageFileNode, StorageUploadDataItem } from './base/core-storage'
