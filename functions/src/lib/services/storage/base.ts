//
// Google Cloud Storage: Node.js Client
// https://googleapis.dev/nodejs/storage/latest/index.html
//

import * as admin from 'firebase-admin'
import * as path from 'path'
import * as shortid from 'shortid'
import { AuthServiceDI, IdToken } from '../../nest'
import { File, GetFilesOptions, SaveOptions } from '@google-cloud/storage'
import { InputValidationError, validateUID } from '../../base'
import { Request, Response } from 'express'
import { arrayToDict, removeBothEndsSlash, removeEndSlash, removeStartSlash, splitHierarchicalPaths } from 'web-base-lib'
import { Dayjs } from 'dayjs'
import { Inject } from '@nestjs/common'
import { UserRecord } from 'firebase-functions/lib/providers/auth'
import dayjs = require('dayjs')

//========================================================================
//
//  Interfaces
//
//========================================================================

//--------------------------------------------------
//  For GraphQL
//--------------------------------------------------

enum StorageNodeType {
  File = 'File',
  Dir = 'Dir',
}

interface StoragePaginationOptionsInput {
  maxChunk?: number
  pageToken?: string
}

interface StoragePaginationResult<T extends StorageNode = StorageNode> {
  list: T[]
  nextPageToken?: string
}

interface StorageNode {
  id: string
  nodeType: StorageNodeType
  name: string
  dir: string
  path: string
  contentType: string
  size: number
  share: StorageNodeShareSettings
  created: Dayjs
  updated: Dayjs
}

interface StorageNodeShareSettings {
  isPublic: boolean | null
  readUIds: string[] | null
  writeUIds: string[] | null
}

interface StorageNodeShareSettingsInput {
  isPublic?: boolean | null
  readUIds?: string[] | null
  writeUIds?: string[] | null
}

class SignedUploadUrlInput {
  filePath!: string
  contentType?: string
}

//--------------------------------------------------
//  For inside of Storage
//--------------------------------------------------

type StorageUser = Pick<IdToken, 'uid' | 'myDirName'> | Pick<UserRecord, 'uid' | 'customClaims'>

interface GCSStorageNode extends StorageNode {
  exists: boolean
  gcsNode: File
}

interface StorageMetadata {
  id: string
  share: StorageNodeShareSettings
  created: Dayjs
  updated: Dayjs
}

interface StorageMetadataInput {
  id?: string | null
  share?: StorageNodeShareSettingsInput | null
  created?: Dayjs
  updated?: Dayjs
}

interface StorageRawMetadata {
  id?: string | null
  isPublic?: string | null
  readUIds?: string | null
  writeUIds?: string | null
  created?: string | null
  updated?: string | null
}

interface UploadDataItem {
  data: string | Buffer
  path: string
  contentType: string
}

//========================================================================
//
//  Implementation
//
//========================================================================

const MAX_CHUNK = 50
const ID_CHECK_COUNT = 5
const ID_CHECK_DURATION = 40

class BaseStorageService {
  //----------------------------------------------------------------------
  //
  //  Constructor
  //
  //----------------------------------------------------------------------

  constructor(@Inject(AuthServiceDI.symbol) protected readonly authService: AuthServiceDI.type) {}

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  /**
   * Cloud Storageから指定されたノード（ディレクトリまたはファイル）を取得します。
   * @param basePath
   * @param nodePath
   * @param options
   */
  async getNode(basePath: string | null, nodePath: string, options?: { maxChunk: number }): Promise<GCSStorageNode | undefined> {
    basePath = removeBothEndsSlash(basePath)
    nodePath = removeBothEndsSlash(nodePath)
    const { maxChunk } = options || { maxChunk: MAX_CHUNK }

    const fileNode = await this.getRealFileNode(basePath, nodePath)
    if (fileNode.exists) return fileNode

    const dirNode = await this.getRealDirNode(basePath, nodePath)
    if (dirNode.exists) return dirNode

    // 引数ノードの親ディレクトリのパスを取得
    let parentPath = ''
    if (path.dirname(nodePath) !== '.') {
      parentPath = path.dirname(nodePath)
    }

    const _getNode: (pageToken?: string) => Promise<GCSStorageNode | undefined> = async pageToken => {
      // 引数ノードの親ディレクトリの子ノードを取得
      const nodeData = await this.getChildren(basePath, parentPath, { pageToken, maxChunk: maxChunk })
      // 引数ノードの親ディレクトリに子ノードが存在しない場合、終了
      // ※つまり引数ノードも兄弟ノードも存在しないことを意味する
      if (nodeData.list.length === 0) return undefined
      // 引数ノードが存在した場合、これを戻り値にして終了
      const dirNode = nodeData.list.find(node => node.path === nodePath)
      if (dirNode) return dirNode
      // 引数ノードの親ディレクトリにまだ子ノードがいる場合は引き続き検索し、
      // もうこれ以上子ノードがいない場合は終了
      return nodeData.nextPageToken ? _getNode(nodeData.nextPageToken) : undefined
    }
    return _getNode()
  }

  /**
   * Cloud Storageから指定されたディレクトリ＋配下のノードを取得します。
   *
   * 引数が次のように指定された場合、
   *   + basePath: 'home'
   *   + dirPath: 'photos'
   *
   * 次のようなノードが取得されます。
   *   + 'home'
   *   + 'home/photos'
   *   + 'home/photos/family.png'
   *   + 'home/photos/children.png'
   *   + 'home/photos/travel/tokyo.png'
   *
   * 戻り値は基準パスのノードが除去され、次のようなノードが返されます。
   *   + 'photos'
   *   + 'photos/family.png'
   *   + 'photos/children.png'
   *   + 'photos/travel/tokyo.png'
   *
   * @param basePath
   * @param dirPath
   * @param options
   */
  async getDirDescendants(
    basePath: string | null,
    dirPath?: string,
    options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult<GCSStorageNode>> {
    dirPath = removeBothEndsSlash(dirPath)

    const nodeData = await this.getRealDirDescendants(basePath, dirPath, options)
    if (nodeData.list.length === 0) {
      return { list: [] }
    }
    const paddedData = await this.padDirNodes(basePath, nodeData.list, dirPath)
    const list = this.sortStorageNodes([...nodeData.list, ...paddedData.addedList])

    return {
      nextPageToken: nodeData.nextPageToken,
      list,
    }
  }

  /**
   * Cloud Storageから指定されたディレクトリ配下のノードを取得します。
   *
   * 引数が次のように指定された場合、
   *   + basePath: 'home'
   *   + dirPath: 'photos'
   *
   * 次のようなノードが検索されます。
   *   + 'home/photos/family.png'
   *   + 'home/photos/children.png'
   *   + 'home/photos/travel/tokyo.png'
   *
   * 戻り値は基準パスのノードが除去され、次のようなノードが返されます。
   *   + 'photos/family.png'
   *   + 'photos/children.png'
   *   + 'photos/travel/tokyo.png'
   *
   * @param basePath
   * @param dirPath
   * @param options
   */
  async getDescendants(
    basePath: string | null,
    dirPath?: string,
    options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult<GCSStorageNode>> {
    dirPath = removeBothEndsSlash(dirPath)

    const nodeData = await this.getRealDirDescendants(basePath, dirPath, options)
    if (nodeData.list.length === 0) {
      return { list: [] }
    }
    const paddedData = await this.padDirNodes(basePath, nodeData.list, dirPath)
    const list = this.sortStorageNodes([...nodeData.list, ...paddedData.addedList]).filter(node => node.path !== dirPath)

    return {
      nextPageToken: nodeData.nextPageToken,
      list,
    }
  }

  /**
   * Cloud Storageから指定されたディレクトリ＋直下のノードを取得します。
   *
   * 引数が次のように指定された場合、
   *   + basePath: 'home'
   *   + dirPath: 'photos'
   *
   * 次のようなノードが検索されます。
   *   + 'home/photos'
   *   + 'home/photos/family.png'
   *   + 'home/photos/children.png'
   *
   * 戻り値は基準パスのノードが除去され、次のようなノードが返されます。
   *   + 'photos'
   *   + 'photos/family.png'
   *   + 'photos/children.png'
   *
   * @param basePath
   * @param dirPath
   * @param options
   */
  async getDirChildren(
    basePath: string | null,
    dirPath?: string,
    options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult<GCSStorageNode>> {
    basePath = removeBothEndsSlash(basePath)
    dirPath = removeBothEndsSlash(dirPath)
    options = options || {}

    // 引数ディレクトリパスをCloud Storageのパスへ変換
    let gcsDirPath = ''
    if (basePath || dirPath) {
      gcsDirPath = path.join(basePath, dirPath, '/')
    }

    // ノード検索オプションの生成
    const getFilesOptions: GetFilesOptions = {
      prefix: gcsDirPath,
      autoPaginate: false,
      delimiter: '/',
      maxResults: MAX_CHUNK,
    }
    if (options.pageToken) getFilesOptions.pageToken = options.pageToken
    if (options.maxChunk) getFilesOptions.maxResults = options.maxChunk

    // Cloud Storageから指定されたディレクトリのノードを取得
    const bucket = admin.storage().bucket()
    const [gcsNodes, _, apiResponse] = await bucket.getFiles(getFilesOptions)

    // 指定されたディレクトリ＋直下の｢ファイル｣を処理
    // ※ここでは直下の｢ディレクトリ｣は処理されない
    const promises1: Promise<GCSStorageNode | undefined>[] = gcsNodes.map(async gcsNode => {
      // basePathが指定されかつ、basePathと取得ノードが一致した場合、無視する
      if (basePath && `${basePath}/` === gcsNode.name) {
        return undefined
      }
      // GCSノードをアプリケーションで扱える形式へ変換
      const node = await this.toStorageNode(basePath, gcsNode)
      node.exists = true
      // ファイルにIDが振られていない場合は設定
      // ※Cloud Storageに手動でアップロードされた場合がこの状況にあたる
      if (!node.id) {
        Object.assign(node, await this.assignIdToNode(basePath, node.gcsNode))
      }
      return node
    })
    const nodes1 = (await Promise.all(promises1)).filter(node => Boolean(node)) as GCSStorageNode[]

    // 直下の｢ディレクトリ｣を処理
    const prefixes: string[] = apiResponse.prefixes || []
    const promises2: Promise<GCSStorageNode | undefined>[] = prefixes.map(async dirPath => {
      // basePathが指定された場合、basePathを取り除く
      if (basePath) {
        dirPath = dirPath.replace(path.join(basePath, '/'), '')
      }
      const childDirNode = await this.getRealDirNode(basePath, dirPath)
      // ディレクトリが存在しない場合、ディレクトリを作成
      // ※Cloud Storageに手動でアップロードされた場合がこの状況にあたる
      if (!childDirNode.exists) {
        Object.assign(childDirNode, await this.saveDirNode(basePath, childDirNode.path))
      }
      // ディレクトリにIDが振られていない場合は設定
      // ※Cloud Storageに手動でディレクトリが作成された場合がこの状況にあたる
      if (!childDirNode.id) {
        Object.assign(childDirNode, await this.assignIdToNode(basePath, childDirNode.gcsNode))
      }
      return childDirNode
    })
    const nodes2 = (await Promise.all(promises2)).filter(node => Boolean(node)) as GCSStorageNode[]

    const nodeDict = arrayToDict([...nodes1, ...nodes2], 'path')

    // 初回検索かつ、引数ディレクトリが指定されている場合
    if (!getFilesOptions.pageToken && dirPath) {
      let dirNode = nodeDict[dirPath]
      // 引数ディレクトリが存在しないのに、直下ノードが存在する場合
      if (!dirNode && Object.keys(nodeDict).length > 0) {
        // 引数ディレクトリを作成
        dirNode = await this.getRealDirNode(basePath, dirPath)
        Object.assign(dirNode, await this.saveDirNode(basePath, dirNode.path))
        nodeDict[dirNode.path] = dirNode
      }
    }

    return {
      nextPageToken: apiResponse.nextPageToken,
      list: this.sortStorageNodes(Object.values(nodeDict)),
    }
  }

  /**
   * Cloud Storageから指定されたディレクトリ直下のノードを取得します。
   *
   * 引数が次のように指定された場合、
   *   + basePath: 'home'
   *   + dirPath: 'photos'
   *
   * 次のようなノードが取得されます。
   *   + 'home/photos/family.png'
   *   + 'home/photos/children.png'
   *
   * 戻り値は基準パスのノードが除去され、次のようなノードが返されます。
   *   + 'photos/family.png'
   *   + 'photos/children.png'
   *
   * @param basePath
   * @param dirPath
   * @param options
   */
  async getChildren(
    basePath: string | null,
    dirPath?: string,
    options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult<GCSStorageNode>> {
    basePath = removeBothEndsSlash(basePath)
    dirPath = removeBothEndsSlash(dirPath)

    const result = await this.getDirChildren(basePath, dirPath, options)
    result.list = result.list.filter(node => node.path !== dirPath)
    return result
  }

  /**
   * 指定されたノードとノードの階層構造を形成するディレクトリを取得します。
   * @param basePath
   * @param nodePath
   */
  async getHierarchicalNodes(basePath: string | null, nodePath: string): Promise<GCSStorageNode[]> {
    basePath = removeBothEndsSlash(basePath)
    nodePath = removeBothEndsSlash(nodePath)

    // 引数ノードの祖先ディレクトリを取得
    const ancestorDirPaths = splitHierarchicalPaths(nodePath)
    // 最後尾のノード(引数ノード)のパスを削除
    // ※引数ノードは以下で別に取得するため
    ancestorDirPaths.pop()

    // 引数ノードを取得
    const node = await this.getNode(basePath, nodePath)

    let dirNodes: GCSStorageNode[]

    // 引数ノードが存在する場合
    if (node) {
      // 引数ノードが存在するので、祖先ディレクトリも存在しなくてはならない
      // ※もし上位ディレクトリがなかった場合は以降で穴埋めする
      dirNodes = [node]
      dirNodes.push(...(await this.getRealDirNodes(basePath, ancestorDirPaths)))
    }
    // 引数ノードが存在しない場合
    else {
      // 引数ノードは存在しないので、実際に存在する祖先ディレクトリのみを取得する
      dirNodes = (await this.getRealDirNodes(basePath, ancestorDirPaths)).filter(node => node.exists)
    }

    // 祖先ディレクトリの穴埋め
    return (await this.padDirNodes(basePath, dirNodes, null)).paddedList
  }

  /**
   * 指定されたノードの階層構造を形成する祖先ディレクトリを取得します。
   * @param basePath
   * @param nodePath
   */
  async getAncestorDirs(basePath: string | null, nodePath: string): Promise<GCSStorageNode[]> {
    basePath = removeBothEndsSlash(basePath)
    nodePath = removeBothEndsSlash(nodePath)

    const result = await this.getHierarchicalNodes(basePath, nodePath)
    return result.filter(node => node.path !== nodePath)
  }

  /**
   * Cloud Storageのディレクトリを作成します。
   *
   * 引数が次のように指定された場合、
   *   + dirPaths[0]: 'photos'
   *   + dirPaths[1]: 'docs'
   *   + basePath: 'home'
   *
   * 次のディレクトリが作成されます。
   *   + 'home'
   *   + 'home/photos'
   *   + 'home/docs'
   *
   * 戻り値は基準パスのノードが除去され、次のようなノードが返されます。
   *   + 'photos'
   *   + 'docs'
   *
   * @param basePath
   * @param dirPaths
   */
  async createDirs(basePath: string | null, dirPaths: string[]): Promise<GCSStorageNode[]> {
    basePath = removeBothEndsSlash(basePath)

    // 指定されたパスのバリデーションチェック
    dirPaths.forEach(dirPath => this.validatePath(dirPath))

    // 引数ディレクトリの階層構造形成に必要なノードを取得
    const hierarchicalDirNodes = await this.getHierarchicalDirNodes(basePath, ...dirPaths)

    // ディレクトリを作成
    const result: GCSStorageNode[] = []
    await Promise.all(
      hierarchicalDirNodes.map(async dirNode => {
        // ディレクトリが存在する場合はディレクトリを作成せず終了
        if (dirNode.exists) return
        // ディレクトリを作成
        Object.assign(dirNode, await this.saveDirNode(basePath, dirNode.path))
        result.push(dirNode)
      })
    )

    return this.sortStorageNodes(result)
  }

  /**
   * Cloud Storageへのファイルアップロードの後に必要な処理を行います。
   * @param basePath
   * @param filePath
   */
  async handleUploadedFile(basePath: string | null, filePath: string): Promise<GCSStorageNode> {
    basePath = removeBothEndsSlash(basePath)
    // 指定されたパスのバリデーションチェック
    this.validatePath(filePath)
    // ファイルノードが存在することを確認
    const fileNode = await this.getRealFileNode(basePath, filePath)
    if (!fileNode.exists) {
      throw new Error(`Uploaded file not found: '${path.join(basePath!, filePath)}'`)
    }
    // ファイルにIDが振られていない場合は設定
    else if (!fileNode.id) {
      Object.assign(fileNode, await this.assignIdToNode(basePath, fileNode.gcsNode))
    }
    // 祖先ディレクトリの穴埋め
    await this.padDirNodes(basePath, [fileNode], null)
    return fileNode
  }

  /**
   * Cloud Storageから指定されたディレクトリを含め配下のノードを削除します。
   *
   * 引数が次のように指定された場合、
   *   + basePath: 'home'
   *   + dirPath: 'photos'
   *
   * 次のようなディレクトリ、ファイルが削除されます。
   *   + 'home/photos'
   *   + 'home/photos/family.png'
   *   + 'home/photos/children.png'
   *
   * 戻り値は基準パスのノードが除去され、次のようなノードが返されます。
   *   + 'photos'
   *   + 'photos/family.png'
   *   + 'photos/children.png'
   *
   * @param basePath
   * @param dirPath
   * @param options
   */
  async removeDir(
    basePath: string | null,
    dirPath: string,
    options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult<GCSStorageNode>> {
    basePath = removeBothEndsSlash(basePath)
    dirPath = removeBothEndsSlash(dirPath)
    const { maxChunk, pageToken } = options || { maxChunk: MAX_CHUNK, pageToken: undefined }

    if (!dirPath) {
      throw new Error(`The argument 'dirPath' is empty.`)
    }

    // 引数ディレクトリと配下ノードを取得
    const nodeData = await this.getRealDirDescendants(basePath, dirPath, { pageToken, maxChunk: maxChunk })

    // 引数ディレクトリ＋配下ノードを削除
    const removedNodes: GCSStorageNode[] = []
    for (const node of nodeData.list) {
      if (node.exists) {
        await node.gcsNode.delete()
        node.exists = false
        removedNodes.push(node)
      }
    }

    return {
      nextPageToken: nodeData.nextPageToken,
      list: this.sortStorageNodes(removedNodes),
    }
  }

  /**
   * Cloud Storageからファイルノードを削除します。
   *
   * 引数が次のように指定された場合、
   *   + basePath: 'home'
   *   + filePath: 'photos/family.png'
   *
   * 次のファイルが削除されます。
   *   + 'home/photos/family.png'
   *
   * 戻り値は基準パスのノードが除去され、次のようなノードが返されます。
   *   + 'photos/family.png'
   *
   * @param basePath
   * @param filePath
   */
  async removeFile(basePath: string | null, filePath: string): Promise<GCSStorageNode | undefined> {
    basePath = removeBothEndsSlash(basePath)

    if (!filePath) {
      throw new Error(`The argument 'filePath' is empty.`)
    }

    const node = await this.getRealFileNode(basePath, filePath)
    let removedNode: GCSStorageNode | undefined
    if (node.exists) {
      await node.gcsNode.delete()
      node.exists = false
      removedNode = node
    }

    return removedNode
  }

  /**
   * Cloud Storageのディレクトリを指定されたディレクトリへ移動します。
   *
   * 引数が次のように指定された場合、
   *   + fromDirPath: 'photos'
   *   + toDirPath: 'archives/photos'
   *   + basePath: 'home'
   *
   * 次のようなディレクトリの移動が行われます。
   *
   *   + 移動元: 'home/photos'
   *   + 移動先: 'home/archives/photos'
   *
   * 戻り値は基準パスのノードが除去され、次のようなノードが返されます。
   *   + 'archives/photos'
   *   + 'archives/photos/20190101'
   *   + 'archives/photos/20190101/family1.png'
   *
   * 移動元ディレクトリまたは移動先ディレクトリがない場合は例外がスローされます。
   *
   * @param basePath
   * @param fromDirPath
   * @param toDirPath
   * @param options
   */
  async moveDir(
    basePath: string | null,
    fromDirPath: string,
    toDirPath: string,
    options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult<GCSStorageNode>> {
    basePath = removeBothEndsSlash(basePath)
    fromDirPath = removeBothEndsSlash(fromDirPath)
    toDirPath = removeBothEndsSlash(toDirPath)
    const { maxChunk, pageToken } = options || { maxChunk: MAX_CHUNK, pageToken: undefined }

    this.validatePath(toDirPath)

    // 移動元と移動先が同じでないことを確認
    if (fromDirPath === toDirPath) {
      throw new Error(`The source and destination are the same: '${path.join(basePath, fromDirPath)}' -> '${path.join(basePath, toDirPath)}'`)
    }

    // 移動先ディレクトリが移動元のサブディレクトリでないことを確認
    // from: aaa/bbb → to: aaa/bbb/ccc/bbb [NG]
    //               → to: aaa/zzz/ccc/bbb [OK]
    if (toDirPath.startsWith(path.join(fromDirPath, '/'))) {
      throw new Error(
        `The destination directory is its own subdirectory: '${path.join(basePath, fromDirPath)}' -> '${path.join(basePath, toDirPath)}'`
      )
    }

    const result: StoragePaginationResult<GCSStorageNode> = { list: [] }

    //
    // 移動元ディレクトリの移動処理
    //
    if (!pageToken) {
      // 移動元ディレクトリの取得
      const dirNode = await this.getRealDirNode(basePath, fromDirPath)
      if (!dirNode.exists) {
        throw new Error(`The source directory does not exist: '${path.join(basePath, fromDirPath)}'`)
      }

      // 移動先ディレクトリの存在確認
      // (アプリケーションまたはユーザーディレクトリ直下へ移動する場合は確認しない)
      let toDirParentNode: GCSStorageNode | undefined
      if (path.dirname(toDirPath) !== '.') {
        const toDirParentPath = path.join(path.dirname(toDirPath), '/')
        toDirParentNode = await this.getRealDirNode(basePath, toDirParentPath)
        if (!toDirParentNode.exists) {
          throw new Error(`The destination directory does not exist: '${path.join(basePath, toDirParentNode.path)}'`)
        }
      }

      await dirNode.gcsNode.move(path.join(basePath, toDirPath, '/'))
      result.list.push(await this.saveDirNode(basePath, toDirPath))
    }

    //
    // 移動元ディレクトリの配下ノードの移動処理
    //
    // 配下ノードを取得
    const nodeData = await this.getRealDirDescendants(basePath, fromDirPath, { maxChunk, pageToken })
    // 配下ノードの移動処理
    const promises: Promise<GCSStorageNode>[] = nodeData.list.map(async node => {
      // 移動元ノードのパスを移動先のパスへ変換
      const reg = new RegExp(`^${fromDirPath}`)
      const newNodePath = node.path.replace(reg, toDirPath)
      switch (node.nodeType) {
        // 移動ノードがディレクトリの場合
        case StorageNodeType.Dir: {
          await node.gcsNode.move(path.join(basePath!, newNodePath, '/'))
          return await this.getRealDirNode(basePath, newNodePath)
        }
        // 移動ノードがファイルの場合
        case StorageNodeType.File: {
          await node.gcsNode.move(path.join(basePath!, newNodePath))
          return await this.getRealFileNode(basePath, newNodePath)
        }
      }
    })
    const movedDescendantList = await Promise.all(promises)

    //
    // 戻り値の加工
    //
    const paddedData = await this.padDirNodes(basePath, movedDescendantList, toDirPath)
    result.list.push(...movedDescendantList, ...paddedData.addedList)
    result.nextPageToken = nodeData.nextPageToken
    this.sortStorageNodes(result.list)

    return result
  }

  /**
   * Cloud Storageのファイルを指定されたディレクトリへ移動します。
   *
   * 引数が次のように指定された場合、
   *   + fromFilePath: 'photos/family.png'
   *   + toFilePath: 'archives/family.png'
   *   + basePath: 'home'
   *
   * 次のようなファイルの移動が行われます。
   *
   *   + 移動元: 'home/photos/family.png'
   *   + 移動先: 'home/archives/family.png'
   *
   * 戻り値は基準パスのノードが除去され、次のようなノードが返されます。
   *   + 'archives/family.png'
   *
   * 移動元ファイルまたは移動先ディレクトリがない場合、移動は行われず、戻り値は何も返しません。
   *
   * @param basePath
   * @param fromFilePath
   * @param toFilePath
   */
  async moveFile(basePath: string | null, fromFilePath: string, toFilePath: string): Promise<GCSStorageNode> {
    basePath = removeBothEndsSlash(basePath)
    fromFilePath = removeBothEndsSlash(fromFilePath)
    toFilePath = removeBothEndsSlash(toFilePath)

    this.validatePath(toFilePath)

    // 移動元ファイルの存在確認
    const fileNode = await this.getRealFileNode(basePath, fromFilePath)
    if (!fileNode.exists) {
      throw new Error(`The source file does not exist: '${path.join(basePath, fileNode.path)}'`)
    }

    // 移動先ディレクトリの存在確認
    const toDirPath = removeStartSlash(path.dirname(toFilePath))
    const toDirNode = await this.getRealDirNode(basePath, toDirPath)
    if (!toDirNode.exists) {
      throw new Error(`The destination directory does not exist: '${path.join(basePath, toDirNode.path)}'`)
    }

    // 移動元ディレクトリの取得
    const fromDirNode = await this.getRealDirNode(basePath, fileNode.dir)

    // ファイルの移動
    await fileNode.gcsNode.move(path.join(basePath, toFilePath))
    return await this.saveFileNode(basePath, toFilePath)
  }

  /**
   * Cloud Storageのディレクトリの名前変更を行います。
   *
   * 引数が次のように指定された場合、
   *   + dirNode: 'photos'
   *   + newName: 'my-photos'
   *   + basePath: 'home'
   *
   * 次のようなディレクトリの名前変更が行われます。
   *
   *   + 変更前: 'home/photos'
   *   + 変更後: 'home/my-photos'
   *
   * 戻り値は基準パスのノードが除去され、次のようなノードが返されます。
   *   + 'my-photos'
   *   + 'my-photos/20190101'
   *   + 'my-photos/20190101/family1.png'
   *
   * リネームするディレクトリがない場合、リネームは行われず、空配列が返されます。
   *
   * @param basePath
   * @param dirPath
   * @param newName
   * @param options
   */
  async renameDir(
    basePath: string | null,
    dirPath: string,
    newName: string,
    options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult<GCSStorageNode>> {
    dirPath = removeBothEndsSlash(dirPath)

    this.validateDirName(newName)

    // リネームした際のパスを作成
    const reg = new RegExp(`${path.basename(dirPath)}$`)
    const toDirPath = dirPath.replace(reg, newName)

    // 初回実行の場合
    if (!options || !options.pageToken) {
      // 既に同じ名前のディレクトリがある場合
      const toDirNode = await this.getRealDirNode(basePath, toDirPath)
      if (toDirNode.exists) {
        throw new Error(`The specified directory name already exists: '${dirPath}' -> '${toDirPath}'`)
      }
    }

    return await this.moveDir(basePath, dirPath, toDirPath, options)
  }

  /**
   * Cloud Storageのファイルの名前変更を行います。
   *
   * 引数が次のように指定された場合、
   *   + filePath: 'photos/family.png'
   *   + newName: 'my-family.png'
   *   + basePath: 'home'
   *
   * 次のような名前変更が行われます。
   *   + 変更前: 'home/photos/family.png'
   *   + 変更後: 'home/photos/my-family.png'
   *
   * 戻り値は基準パスのノードが除去され、次のようなノードが返されます。
   *   + 'photos/my-family.png'
   *
   * リネームするファイルがない場合、移動行われず、戻り値は何も返しません。
   *
   * @param basePath
   * @param filePath
   * @param newName
   */
  async renameFile(basePath: string | null, filePath: string, newName: string): Promise<GCSStorageNode> {
    filePath = removeBothEndsSlash(filePath)

    this.validateFileName(newName)

    // リネームした際のパスを作成
    const reg = new RegExp(`${path.basename(filePath)}$`)
    const toFilePath = filePath.replace(reg, newName)

    // 既に同じ名前のファイルがある場合
    const toFileNode = await this.getRealFileNode(basePath, toFilePath)
    if (toFileNode.exists) {
      throw new Error(`The specified file name already exists: '${filePath}' -> '${toFilePath}'`)
    }

    return await this.moveFile(basePath, filePath, toFilePath)
  }

  /**
   * Cloud Storageのディレクトリに対して共有設定を行います。
   * @param basePath
   * @param dirPath
   * @param settings
   */
  async setDirShareSettings(basePath: string | null, dirPath: string, settings: StorageNodeShareSettingsInput | null): Promise<GCSStorageNode> {
    basePath = removeBothEndsSlash(basePath)
    dirPath = removeBothEndsSlash(dirPath)

    const dirNode = await this.getRealDirNode(basePath, dirPath)
    if (!dirNode.exists) {
      throw new Error(`The specified directory does not exist: '${path.join(basePath, dirPath)}'`)
    }

    settings?.readUIds?.forEach(uid => {
      if (!validateUID(uid)) {
        throw new Error(`The specified 'readUIds' had an incorrect value: '${uid}'`)
      }
    })

    settings?.writeUIds?.forEach(uid => {
      if (!validateUID(uid)) {
        throw new Error(`The specified 'writeUIds' had an incorrect value: '${uid}'`)
      }
    })

    Object.assign(dirNode, await this.saveDirNode(basePath, dirNode.path, { share: settings }))

    return dirNode
  }

  /**
   * Cloud Storageのファイルに対して共有設定を行います。
   * @param basePath
   * @param filePath
   * @param settings
   */
  async setFileShareSettings(basePath: string | null, filePath: string, settings: StorageNodeShareSettingsInput | null): Promise<GCSStorageNode> {
    basePath = removeBothEndsSlash(basePath)
    filePath = removeBothEndsSlash(filePath)

    const fileNode = await this.getRealFileNode(basePath, filePath)
    if (!fileNode.exists) {
      throw new Error(`The specified file does not exist: '${path.join(basePath, filePath)}'`)
    }

    settings?.readUIds?.forEach(uid => {
      if (!validateUID(uid)) {
        throw new Error(`The specified 'readUIds' had an incorrect value: '${uid}'`)
      }
    })

    settings?.writeUIds?.forEach(uid => {
      if (!validateUID(uid)) {
        throw new Error(`The specified 'writeUIds' had an incorrect value: '${uid}'`)
      }
    })

    Object.assign(fileNode, await this.saveFileNode(basePath, fileNode.path, null, { share: settings }))

    return fileNode
  }

  /**
   * 署名付きのアップロードURLを取得します。
   * @param requestOrigin
   * @param inputs
   */
  async getSignedUploadUrls(requestOrigin: string, inputs: SignedUploadUrlInput[]): Promise<string[]> {
    const bucket = admin.storage().bucket()
    const urlDict: { [path: string]: string } = {}

    for (const input of inputs) {
      const { filePath, contentType } = input
      const gcsFileNode = bucket.file(filePath)
      const [url] = await gcsFileNode.createResumableUpload({
        origin: requestOrigin,
        metadata: { contentType },
      })
      urlDict[filePath] = url
    }

    return inputs.map(input => urlDict[input.filePath])
  }

  /**
   * Cloud Storageからノードを取得します。
   * @param basePath
   * @param nodePath
   *   ファイルまたはディレクトリのパスを指定します。
   *   ディレクトリパスを指定する場合は末尾に'/'を付与するよう注意してください。
   */
  async getRealNode(basePath: string | null, nodePath: string): Promise<GCSStorageNode> {
    basePath = removeBothEndsSlash(basePath)
    nodePath = removeStartSlash(nodePath)

    const bucket = admin.storage().bucket()
    const gcsNodePath = path.join(basePath, nodePath)
    const gcsNode = bucket.file(gcsNodePath)
    const result = await this.toStorageNodeAsync(basePath, gcsNode)

    return result
  }

  /**
   * Cloud Storageからノードを取得します。
   * @param basePath
   * @param nodePaths
   */
  async getRealNodes(basePath: string | null, nodePaths: string[]): Promise<GCSStorageNode[]> {
    const nodeDic: { [path: string]: GCSStorageNode } = {}

    await Promise.all(
      nodePaths.map(async nodePath => {
        const node = await this.getRealNode(basePath, nodePath)
        nodeDic[node.path] = node
      })
    )

    return nodePaths.reduce((result, nodePath) => {
      const node = nodeDic[removeBothEndsSlash(nodePath)]
      if (node) result.push(node)
      return result
    }, [] as GCSStorageNode[])
  }

  /**
   * Cloud Storageからディレクトリノードを取得します。
   * @param basePath
   * @param dirPath
   */
  async getRealDirNode(basePath: string | null, dirPath: string): Promise<GCSStorageNode> {
    return this.getRealNode(basePath, path.join(dirPath, '/'))
  }

  /**
   * Cloud Storageからディレクトリノードを取得します。
   * @param basePath
   * @param dirPaths
   */
  async getRealDirNodes(basePath: string | null, dirPaths: string[]): Promise<GCSStorageNode[]> {
    const dirNodeDict: { [path: string]: GCSStorageNode } = {}

    await Promise.all(
      dirPaths.map(async dirPath => {
        const dirNode = await this.getRealDirNode(basePath, dirPath)
        dirNodeDict[dirNode.path] = dirNode
      })
    )

    return dirPaths.reduce((result, dirPath) => {
      const dirNode = dirNodeDict[dirPath]
      if (dirNode) result.push(dirNode)
      return result
    }, [] as GCSStorageNode[])
  }

  /**
   * Cloud Storageからファイルノードを取得します。
   * @param basePath
   * @param filePath
   */
  async getRealFileNode(basePath: string | null, filePath: string): Promise<GCSStorageNode> {
    return this.getRealNode(basePath, removeEndSlash(filePath))
  }

  /**
   * Cloud Storageからファイルノードを取得します。
   * @param basePath
   * @param filePaths
   */
  async getRealFileNodes(basePath: string | null, filePaths: string[]): Promise<GCSStorageNode[]> {
    const fileNodeDict: { [path: string]: GCSStorageNode } = {}

    await Promise.all(
      filePaths.map(async dirPath => {
        const fileNode = await this.getRealFileNode(basePath, dirPath)
        fileNodeDict[fileNode.path] = fileNode
      })
    )

    return filePaths.reduce((result, dirPath) => {
      const fileNode = fileNodeDict[dirPath]
      if (fileNode) result.push(fileNode)
      return result
    }, [] as GCSStorageNode[])
  }

  /**
   * クライアントから指定されたファイルをサーブします。
   * @param req
   * @param res
   * @param file
   */
  async serveFile(req: Request, res: Response, file: string | GCSStorageNode): Promise<Response> {
    let fileNode: GCSStorageNode
    if (typeof file === 'string') {
      fileNode = await this.getRealFileNode(null, file)
    } else {
      fileNode = file
    }

    if (!fileNode.exists) {
      return res.sendStatus(404)
    }

    const lastModified = fileNode.updated.toString()
    const ifModifiedSinceStr = req.header('If-Modified-Since')
    const ifModifiedSince = ifModifiedSinceStr ? dayjs(ifModifiedSinceStr).toString() : undefined
    if (lastModified === ifModifiedSince) {
      return res.sendStatus(304)
    }

    res.setHeader('Last-Modified', lastModified)
    res.setHeader('Content-Type', fileNode.gcsNode.metadata.contentType)
    const fileStream = fileNode.gcsNode.createReadStream()

    fileStream.pipe(res)
    return res
  }

  /**
   * ローカルファイルをCloud Storageへアップロードします。
   * @param basePath
   * @param uploadList
   */
  async uploadLocalFiles(basePath: string | null, uploadList: { localFilePath: string; toFilePath: string }[]): Promise<GCSStorageNode[]> {
    basePath = removeBothEndsSlash(basePath)
    const bucket = admin.storage().bucket()

    const uploadedFileDict: { [path: string]: GCSStorageNode } = {}
    const promises: Promise<void>[] = []
    for (const uploadItem of uploadList) {
      const destination = path.join(basePath, removeBothEndsSlash(uploadItem.toFilePath))
      promises.push(
        bucket.upload(uploadItem.localFilePath, { destination }).then(async response => {
          const [file, metadata] = response
          const fileNode = this.toStorageNode(basePath, file)
          Object.assign(fileNode, await this.assignIdToNode(basePath, fileNode.gcsNode))
          uploadedFileDict[fileNode.path] = fileNode
        })
      )
    }
    await Promise.all(promises)

    return uploadList.reduce<GCSStorageNode[]>((result, item) => {
      result.push(uploadedFileDict[removeStartSlash(item.toFilePath)])
      return result
    }, [])
  }

  /**
   * 指定されたデータをファイルとしてCloud Storageへアップロードします。
   * @param basePath
   * @param uploadList
   */
  async uploadAsFiles(basePath: string | null, uploadList: UploadDataItem[]): Promise<GCSStorageNode[]> {
    basePath = removeBothEndsSlash(basePath)
    const bucket = admin.storage().bucket()

    const uploadedFileDict: { [path: string]: GCSStorageNode } = {}
    const promises: Promise<void>[] = []
    for (const uploadItem of uploadList) {
      promises.push(
        (async () => {
          const gcsFileNode = bucket.file(path.join(basePath, uploadItem.path))
          const fileNode = this.toStorageNode(basePath, gcsFileNode)
          const options = { contentType: uploadItem.contentType }
          Object.assign(fileNode, await this.saveFileNode(basePath, fileNode.path, { data: uploadItem.data, options }))
          uploadedFileDict[fileNode.path] = fileNode
        })()
      )
    }
    await Promise.all(promises)

    return uploadList.reduce<GCSStorageNode[]>((result, item) => {
      result.push(uploadedFileDict[removeStartSlash(item.path)])
      return result
    }, [])
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  /**
   * Cloud Storageから指定されたディレクトリ＋配下の実際に存在するノードを取得します。
   * @param basePath
   * @param dirPath
   * @param options
   */
  async getRealDirDescendants(
    basePath: string | null,
    dirPath?: string,
    options?: StoragePaginationOptionsInput
  ): Promise<{ nextPageToken?: string; list: GCSStorageNode[] }> {
    basePath = removeBothEndsSlash(basePath)
    dirPath = removeBothEndsSlash(dirPath)
    options = options || {}

    // 引数のディレクトリパスをCloud Storageのパスへ変換
    let gcsDirPath = ''
    if (basePath || dirPath) {
      gcsDirPath = path.join(basePath, dirPath, '/')
    }

    // ノード検索オプションの生成
    const getFilesOptions: GetFilesOptions = { prefix: gcsDirPath, maxResults: MAX_CHUNK }
    if (options.pageToken) getFilesOptions.pageToken = options.pageToken
    if (options.maxChunk) getFilesOptions.maxResults = options.maxChunk

    // Cloud Storageから指定されたディレクトリのノードを取得
    const bucket = admin.storage().bucket()
    const [gcsNodes, , apiResponse] = await bucket.getFiles(getFilesOptions)
    if (gcsNodes.length === 0) return { list: [] }

    const list: GCSStorageNode[] = []

    // Cloud Storageから取得したノードを戻り値に加工
    for (const gcsNode of gcsNodes) {
      // basePathが指定されかつ、basePathと取得ノードが一致した場合、無視する
      if (basePath && `${basePath}/` === gcsNode.name) {
        continue
      }
      // GCSノードをアプリケーションで扱える形式へ変換
      const node = await this.toStorageNode(basePath, gcsNode)
      node.exists = true
      // ノードにIDが振られていない場合、IDを採番
      // ※Cloud Storageに手動でディレクトリ作成またはアップロードされた場合がこの状況にあたる
      if (!node.id) {
        Object.assign(node, await this.assignIdToNode(basePath, node.gcsNode))
      }
      list.push(node)
    }

    return { list, nextPageToken: apiResponse.nextPageToken }
  }

  /**
   * Cloud Storageから指定されたディレクトリ直下の実際に存在するノードを取得します。
   * @param basePath
   * @param dirPath
   * @param options
   */
  protected async getRealDirChildren(
    basePath: string | null,
    dirPath?: string,
    options?: StoragePaginationOptionsInput
  ): Promise<{ nextPageToken?: string; list: GCSStorageNode[] }> {
    basePath = removeBothEndsSlash(basePath)
    dirPath = removeBothEndsSlash(dirPath)
    options = options || {}

    // 引数ディレクトリパスをCloud Storageのパスへ変換
    let gcsDirPath = ''
    if (basePath || dirPath) {
      gcsDirPath = path.join(basePath, dirPath, '/')
    }

    // ノード検索オプションの生成
    const getFilesOptions: GetFilesOptions = {
      prefix: gcsDirPath,
      autoPaginate: false,
      delimiter: '/',
      maxResults: MAX_CHUNK,
    }
    if (options.pageToken) getFilesOptions.pageToken = options.pageToken
    if (options.maxChunk) getFilesOptions.maxResults = options.maxChunk

    // Cloud Storageから指定されたディレクトリのノードを取得
    const bucket = admin.storage().bucket()
    const [gcsNodes, _, apiResponse] = await bucket.getFiles(getFilesOptions)

    // 指定されたディレクトリと直下のファイルを処理
    // ※ここでは直下の｢ディレクトリ｣は処理されない
    const promises1: Promise<GCSStorageNode | undefined>[] = gcsNodes.map(async gcsNode => {
      // basePathが指定されかつ、basePathと取得ノードが一致した場合、無視する
      if (basePath && `${basePath}/` === gcsNode.name) {
        return undefined
      }
      // GCSノードをアプリケーションで扱える形式へ変換
      const node = await this.toStorageNode(basePath, gcsNode)
      node.exists = true
      // ファイルにIDが振られていない場合は設定
      // ※Cloud Storageに手動でアップロードされた場合がこの状況にあたる
      if (!node.id) {
        Object.assign(node, await this.assignIdToNode(basePath, node.gcsNode))
      }
      return node
    })
    const nodes1 = (await Promise.all(promises1)).filter(node => Boolean(node)) as GCSStorageNode[]

    // 直下のディレクトリを処理
    const prefixes: string[] = apiResponse.prefixes || []
    const promises2: Promise<GCSStorageNode | undefined>[] = prefixes.map(async dirPath => {
      // basePathが指定された場合、basePathを取り除く
      if (basePath) {
        dirPath = dirPath.replace(path.join(basePath, '/'), '')
      }
      const childDirNode = await this.getRealDirNode(basePath, dirPath)
      // ディレクトリが存在しない場合、ディレクトリを作成
      // ※Cloud Storageに手動でアップロードされた場合がこの状況にあたる
      if (!childDirNode.exists) {
        Object.assign(childDirNode, await this.saveDirNode(basePath, childDirNode.path))
      }
      // ディレクトリにIDが振られていない場合は設定
      // ※Cloud Storageに手動でディレクトリが作成された場合がこの状況にあたる
      if (!childDirNode.id) {
        Object.assign(childDirNode, await this.assignIdToNode(basePath, childDirNode.gcsNode))
      }
      return childDirNode
    })
    const nodes2 = (await Promise.all(promises2)).filter(node => Boolean(node)) as GCSStorageNode[]

    const nodeDict = arrayToDict([...nodes1, ...nodes2], 'path')

    // 引数ディレクトリが指定されている場合
    if (dirPath) {
      let dirNode = nodeDict[dirPath]
      // 引数ディレクトリが存在しないのに、直下ノードが存在する場合
      if (!dirNode && Object.keys(nodeDict).length > 0) {
        // 引数ディレクトリを作成
        dirNode = await this.getRealDirNode(basePath, dirPath)
        Object.assign(dirNode, await this.saveDirNode(basePath, dirNode.path))
        nodeDict[dirNode.path] = dirNode
      }
    }

    return {
      nextPageToken: apiResponse.nextPageToken,
      list: this.sortStorageNodes(Object.values(nodeDict)),
    }
  }

  /**
   * Cloud Storageへディレクトリノードを保存します。
   * @param basePath
   * @param dirPath
   * @param metadata
   */
  protected async saveDirNode(basePath: string | null, dirPath: string, metadata?: Omit<StorageMetadataInput, 'id'>): Promise<GCSStorageNode> {
    const result = await this.getRealDirNode(basePath, dirPath)

    // ディレクトリを保存
    if (!result.exists) {
      await result.gcsNode.save('')
    }

    // 現在のメタデータと引数のメタデータをマージ
    // ※作成日時と更新日時は引数の内容を優先するため、現在のメタデータは削除
    // ※引数に作成日時または更新日時が指定されなかった場合、saveMetadata()で規定の設定処理が行われる
    const curMetadata = this.extractMetaData(result.gcsNode)
    delete curMetadata.created
    delete curMetadata.updated
    const newMetadata = Object.assign(curMetadata, metadata)
    // IDが設定されている場合はそのIDを引き続き使用し、設定されていない場合はIDを生成
    newMetadata.id = result.id ? result.id : shortid.generate()

    // メタデータの保存
    Object.assign(result, await this.saveMetadata(basePath, result.gcsNode, newMetadata))

    return result
  }

  /**
   * Cloud Storageへファイルノードを保存します。
   * @param basePath
   * @param filePath
   * @param dataParams
   * @param metadata
   */
  protected async saveFileNode(
    basePath: string | null,
    filePath: string,
    dataParams?: { data: any; options?: SaveOptions } | null,
    metadata?: Omit<StorageMetadataInput, 'id'>
  ): Promise<GCSStorageNode> {
    const result = await this.getRealFileNode(basePath, filePath)

    //
    // ファイルのコンテンツデータを保存
    //
    // コンテンツデータのパラメータが指定された場合
    if (dataParams) {
      const curRawMetadata = this.toRawMetadata(this.extractMetaData(result.gcsNode))
      const options = Object.assign({ metadata: { metadata: curRawMetadata } }, dataParams.options)
      await result.gcsNode.save(dataParams.data, options)
    }
    // コンテンツデータのパラメータが指定されなかった場合
    else {
      // まだファイルが存在しない場合、空ファイルを作成
      if (!result.exists) {
        await result.gcsNode.save('')
      }
    }

    // 現在のメタデータと引数のメタデータをマージ
    // ※作成日時と更新日時は引数の内容を優先するため、現在のメタデータは削除
    // ※引数に作成日時または更新日時が指定されなかった場合、saveMetadata()で規定の設定処理が行われる
    const curMetadata = this.extractMetaData(result.gcsNode)
    delete curMetadata.created
    delete curMetadata.updated
    const newMetadata = Object.assign(curMetadata, metadata)
    // IDが設定されている場合はそのIDを引き続き使用し、設定されていない場合はIDを生成
    newMetadata.id = result.id ? result.id : shortid.generate()

    // メタデータの保存
    Object.assign(result, await this.saveMetadata(basePath, result.gcsNode, newMetadata))

    return result
  }

  /**
   * Cloud Storageから取得したノードをStorageNodeへ変換します。
   *
   * `basePath`が指定された場合、`gcsNode`のパスから基準パスが除去されます。
   * 引数が次のような場合:
   *   + `gcsNode`のパス: users/[USER_ID]/images/family.png
   *   + `basePath`: users/[USER_ID]
   *
   * `gcsNode`のパスから基準パスが除去され、戻り値のノードパスは次のようになります:
   *   + images/family.png
   *
   * @param basePath
   * @param gcsNode
   */
  protected toStorageNode(basePath: string | null, gcsNode: File): GCSStorageNode {
    let nodePath = removeBothEndsSlash(gcsNode.name)
    if (basePath) {
      basePath = removeBothEndsSlash(basePath)
      const basePathReg = new RegExp(`^${basePath}`)
      nodePath = removeBothEndsSlash(nodePath.replace(basePathReg, ''))
    }
    const relativePathSegments = nodePath.split('/')
    const name = relativePathSegments[relativePathSegments.length - 1]
    const dir = relativePathSegments.slice(0, relativePathSegments.length - 1).join('/')

    // ノード名の末尾が'/'の場合はディレクトリ、それ以外はファイルと判定
    const nodeType = gcsNode.name.match(/\/$/) ? StorageNodeType.Dir : StorageNodeType.File

    // メタデータの取得
    const storageMetadata = this.extractMetaData(gcsNode)

    return {
      id: storageMetadata.id,
      nodeType,
      name,
      dir: removeStartSlash(dir),
      path: removeStartSlash(nodePath),
      contentType: gcsNode.metadata.contentType || '',
      size: Number(gcsNode.metadata.size || '0'),
      share: storageMetadata.share,
      created: storageMetadata.created,
      updated: storageMetadata.updated,
      exists: false,
      gcsNode: gcsNode,
    }
  }

  /**
   * Cloud Storageから取得したノードをStorageNodeへ変換します。
   * 基本機能は`toStorageNode()`で、これに加えて「ノードの存在チェック」と
   * 「メタデータの取得」をCloud Storageに実際にアクセスして行います。
   * @param basePath
   * @param gcsNode
   */
  protected async toStorageNodeAsync(basePath: string | null, gcsNode: File): Promise<GCSStorageNode> {
    // ノードが実際に存在するか取得
    // TODO 重要:
    //  gcsNode.exists()ではごくたまに本当はノードが存在するのに関わらず、
    //  存在しないという結果が返ってくるという致命的な不具合が存在する(2020/04/04現在)。
    //  このため存在チェックを複数回行うことでこの不具合を回避している。
    let exists = false
    for (let i = 1; i <= ID_CHECK_COUNT; i++) {
      const [_exists] = await gcsNode.exists()
      if (_exists) {
        exists = _exists
        break
      }
      await this.sleep(ID_CHECK_DURATION)
    }

    // メタデータの取得
    const storageMetadata: StorageMetadata = {
      id: '',
      share: { isPublic: null, readUIds: null, writeUIds: null },
      created: dayjs(0),
      updated: dayjs(0),
    }
    if (exists) {
      Object.assign(storageMetadata, this.extractMetaData(gcsNode))
    }

    return Object.assign(this.toStorageNode(basePath, gcsNode), {
      id: storageMetadata.id,
      share: storageMetadata.share,
      created: storageMetadata.created,
      updated: storageMetadata.updated,
      exists,
    })
  }

  /**
   * ノード配列をディレクトリ階層に従ってソートします。
   * @param nodes
   */
  protected sortStorageNodes<NODE extends StorageNode>(nodes: NODE[]): NODE[] {
    nodes.sort((a, b) => {
      // ソート用文字列(strA, strB)の説明:
      //   ノードがファイルの場合、同じ階層にあるディレクトリより順位を下げるために
      //   大きな文字コード'0xffff'を付加している。これにより同一階層のファイルと
      //   ディレクトリを比較した際、ファイルの方が文字的に大きいと判断され、下の方へ
      //   配置されることになる。

      let strA = a.path
      let strB = b.path
      if (a.nodeType === StorageNodeType.File) {
        strA = `${a.dir}${String.fromCodePoint(0xffff)}${a.name}`
      }
      if (b.nodeType === StorageNodeType.File) {
        strB = `${b.dir}${String.fromCodePoint(0xffff)}${b.name}`
      }

      if (strA < strB) {
        return -1
      } else if (strA > strB) {
        return 1
      } else {
        return 0
      }
    })
    return nodes
  }

  /**
   * 親ディレクトリがない場合、ディレクトリを作成して穴埋めします。
   * このようなことを行う理由として、Cloud Storageは親ディレクトリが存在しないことがあるためです。
   * 例えば、'aaa/bbb/family.png'の場合、'aaa/bbb/'というディレクトリが存在しない場合があります。
   * このように親ディレクトリがない場合、ディレクトリを作成して穴埋めします。
   *
   * `topPath`は最上位のパスで、このパスより上位のディレクトリは作成しません。
   * 例えば、'aaa/bbb/ccc/family.png'というノードがあり、ディレクトリが存在しないとします。
   * この条件で`topPath`に'aaa/bbb'を指定すると次のようなディレクトリノードが作成されます。
   *   + 'aaa' ← 最上位パスより上なので作成されない
   *   + 'aaa/bbb' ← 最上位パスと一致するので作成される
   *   + 'aaa/bbb/ccc' ← 作成される
   *
   * @param basePath
   * @param nodes
   * @param topPath
   */
  protected async padDirNodes(
    basePath: string | null,
    nodes: GCSStorageNode[],
    topPath: string | null
  ): Promise<{ addedList: GCSStorageNode[]; paddedList: GCSStorageNode[] }> {
    basePath = removeBothEndsSlash(basePath)
    topPath = removeBothEndsSlash(topPath)

    // 指定された全ノードの階層的なディレクトリパスを取得
    const dirPaths = nodes.map(node => {
      switch (node.nodeType) {
        case StorageNodeType.Dir:
          return node.path
        case StorageNodeType.File:
          return node.dir
      }
    })
    const hierarchicalDirPaths = splitHierarchicalPaths(...dirPaths, topPath).filter(dirPath => {
      if (!topPath) return true
      // 引数で指定された最上位パス以下が対象
      return dirPath === topPath || dirPath.startsWith(`${topPath}/`)
    })

    // 欠けているディレクトリを穴埋め
    const nodeDict = arrayToDict(nodes, 'path')
    const addedList: GCSStorageNode[] = []
    const paddedList: GCSStorageNode[] = nodes.filter(node => node.nodeType === StorageNodeType.File)
    const promises = hierarchicalDirPaths.map(async dirPath => {
      // ディレクトリの取得
      let dirNode = nodeDict[dirPath]
      if (!dirNode) {
        dirNode = await this.getRealDirNode(basePath, dirPath)
      }
      paddedList.push(dirNode)
      // ディレクトリが実際には存在しない場合、ディレクトリを作成
      if (!dirNode.exists) {
        Object.assign(dirNode, await this.saveDirNode(basePath, dirNode.path))
        addedList.push(dirNode)
      }
      // ディレクトリにIDが振られていない場合、IDを採番
      // ※Cloud Storageに手動でディレクトリが作成された場合がこの状況にあたる
      else if (!dirNode.id) {
        Object.assign(dirNode, await this.assignIdToNode(basePath, dirNode.gcsNode))
      }
    })
    await Promise.all(promises)

    this.sortStorageNodes(addedList)
    this.sortStorageNodes(paddedList)
    return { addedList, paddedList }
  }

  /**
   * 指定されたディレクトリの階層構造を形成するのに必要なノードを取得します。
   * @param basePath
   * @param dirs
   */
  protected async getHierarchicalDirNodes(basePath: string | null, ...dirs: string[] | GCSStorageNode[]): Promise<GCSStorageNode[]> {
    const dirNodeDict: { [path: string]: GCSStorageNode } = {}
    for (const dir of dirs) {
      if (typeof dir === 'string') {
        const dirNode = await this.getRealDirNode(basePath, dir)
        dirNodeDict[dirNode.path] = dirNode
      } else {
        dirNodeDict[dir.path] = dir
      }
    }

    const hierarchicalPaths = splitHierarchicalPaths(...Object.keys(dirNodeDict))
    const hierarchicalNodes: GCSStorageNode[] = [...Object.values(dirNodeDict)]
    await Promise.all(
      hierarchicalPaths.map(async nodePath => {
        if (dirNodeDict[nodePath]) return
        const dirNode = await this.getRealDirNode(basePath, nodePath)
        hierarchicalNodes.push(dirNode)
      })
    )

    return this.sortStorageNodes(hierarchicalNodes)
  }

  /**
   * 指定されたファイルの階層構造を形成するのに必要なノードを取得します。
   * @param basePath
   * @param files
   */
  protected async getHierarchicalFileNodes(basePath: string | null, ...files: string[] | GCSStorageNode[]): Promise<GCSStorageNode[]> {
    const fileNodeDict: { [path: string]: GCSStorageNode } = {}
    for (const file of files) {
      if (typeof file === 'string') {
        const fileNode = await this.getRealFileNode(basePath, file)
        fileNodeDict[fileNode.path] = fileNode
      } else {
        fileNodeDict[file.path] = file
      }
    }

    const hierarchicalPaths = splitHierarchicalPaths(...Object.keys(fileNodeDict))
    const hierarchicalNodes: GCSStorageNode[] = [...Object.values(fileNodeDict)]
    await Promise.all(
      hierarchicalPaths.map(async nodePath => {
        if (fileNodeDict[nodePath]) return
        const dirNode = await this.getRealDirNode(basePath, nodePath)
        hierarchicalNodes.push(dirNode)
      })
    )

    return this.sortStorageNodes(hierarchicalNodes)
  }

  /**
   * ディレクトリリストをサマリーします。
   *
   * `dirPaths`に次が指定された場合:
   *   + dir1/dir1-1
   *   + dir1/dir1-1/dir1-1-1
   *   + dir1/dir1-1/dir1-1-2
   *   + dir2/dir2-1
   *   + dir2/dir2-1/dir2-1-1
   *
   * 結果として次のようにサマリーされます:
   *   + dir1/dir1-1/dir1-1-1
   *   + dir1/dir1-1/dir1-1-2
   *   + dir2/dir2-1/dir2-1-1
   */
  protected summarizeDirPaths(dirPaths: string[]): string[] {
    const pushMaxDirPathToArray = (array: string[], newDirPath: string) => {
      for (let i = 0; i < array.length; i++) {
        const dirPath = array[i]
        if (dirPath.startsWith(newDirPath)) {
          return
        } else if (newDirPath.startsWith(dirPath)) {
          array[i] = newDirPath
          return
        }
      }
      array.push(newDirPath)
    }

    const result: string[] = []
    for (const dirPath of dirPaths) {
      pushMaxDirPathToArray(result, dirPath)
    }
    return result
  }

  /**
   * ノードパスのチェックを行います。
   * @param nodePath
   */
  protected validatePath(nodePath: string): void {
    if (!nodePath) {
      throw new InputValidationError('The specified path is empty.')
    }

    // 改行、タブが含まれないことを検証
    if (/\r?\n|\t/g.test(nodePath)) {
      throw new InputValidationError('The specified path is invalid.', {
        path: nodePath,
      })
    }
  }

  /**
   * ディレクトリ名のチェックを行います。
   * @param dirName
   */
  protected validateDirName(dirName: string): void {
    this.validatePath(dirName)
    // '/'が含まれないことを検証
    if (/\//g.test(dirName)) {
      throw new InputValidationError('The specified directory name is invalid.', { dirName })
    }
  }

  /**
   * ファイル名のチェックを行います。
   * @param fileName
   */
  protected validateFileName(fileName: string): void {
    this.validatePath(fileName)
    // '/'が含まれないことを検証
    if (/\//g.test(fileName)) {
      throw new InputValidationError('The specified file name is invalid.', { fileName })
    }
  }

  //--------------------------------------------------
  //  メタデータ
  //--------------------------------------------------

  /**
   * ノードにIDを割り当てます。
   * @param basePath
   * @param gcsNode
   */
  protected async assignIdToNode(basePath: string | null, gcsNode: File): Promise<GCSStorageNode> {
    return await this.saveMetadata(basePath, gcsNode, { id: shortid.generate() })
  }

  /**
   * 指定されたGCSノードのメタデータを保存します。
   * @param basePath
   * @param gcsNode
   * @param metadata
   */
  protected async saveMetadata(basePath: string | null, gcsNode: File, metadata: StorageMetadataInput): Promise<GCSStorageNode> {
    const curMetadata = this.extractMetaData(gcsNode)
    const newMetadata = Object.assign({}, metadata)
    const now = dayjs()

    // 作成日時
    // 引数に作成日時が指定されてなく、かつまだ作成日時が設定されていない場合
    const hasArgCreated = metadata.created && !metadata.created.isSame(dayjs(0))
    if (!hasArgCreated && curMetadata.created.isSame(dayjs(0))) {
      newMetadata.created = now // 現在時刻を作成日時に設定
    }

    // 更新日時
    // 引数に更新時刻が指定されていない場合
    const hasArgUpdated = metadata.updated && !metadata.updated.isSame(dayjs(0))
    if (!hasArgUpdated) {
      newMetadata.updated = now // 現在時刻を更新日時に設定
    }

    // メタデータを保存
    await gcsNode.setMetadata({ metadata: this.toRawMetadata(newMetadata) })

    // 戻り値
    const result = this.toStorageNode(basePath, gcsNode)
    result.exists = true
    return result
  }

  /**
   * メタデータをGCSへ保存できる形式へ変換します。
   * @param metadata
   */
  protected toRawMetadata(metadata: StorageMetadataInput): StorageRawMetadata {
    const result: StorageRawMetadata = {}

    if (typeof metadata.id !== 'undefined') {
      result.id = metadata.id
    }

    if (typeof metadata.share !== 'undefined') {
      if (metadata.share === null) {
        result.isPublic = null
        result.readUIds = null
        result.writeUIds = null
      } else {
        if (typeof metadata.share.isPublic !== 'undefined') {
          if (metadata.share.isPublic === null) {
            result.isPublic = null
          } else {
            result.isPublic = metadata.share.isPublic.toString()
          }
        }
        if (typeof metadata.share.readUIds !== 'undefined') {
          if (metadata.share.readUIds === null) {
            result.readUIds = null
          } else {
            const readUIdsStr = metadata.share.readUIds.filter(uid => validateUID(uid)).join(',')
            result.readUIds = readUIdsStr || null
          }
        }
        if (typeof metadata.share.writeUIds !== 'undefined') {
          if (metadata.share.writeUIds === null) {
            result.writeUIds = null
          } else {
            const readUIdsStr = metadata.share.writeUIds.filter(uid => validateUID(uid)).join(',')
            result.writeUIds = readUIdsStr || null
          }
        }
      }
    }

    if (metadata.created) {
      result.created = metadata.created.toISOString()
    }

    if (metadata.updated) {
      result.updated = metadata.updated.toISOString()
    }

    return result
  }

  /**
   * 指定されたGCSノードからメタデータを取得します。
   * @param gcsNode
   */
  protected extractMetaData(gcsNode: File): StorageMetadata {
    const metadata = gcsNode.metadata.metadata || {}

    const result: StorageMetadata = {
      id: metadata.id || '',
      share: { isPublic: null, readUIds: null, writeUIds: null },
      created: metadata.created ? dayjs(metadata.created) : dayjs(0),
      updated: metadata.updated ? dayjs(metadata.updated) : dayjs(0),
    }

    if (metadata.isPublic) {
      result.share.isPublic = metadata.isPublic === 'true' ? true : false
    }
    if (metadata.readUIds) {
      result.share.readUIds = metadata.readUIds.split(',')
    }
    if (metadata.writeUIds) {
      result.share.writeUIds = metadata.writeUIds.split(',')
    }

    return result
  }

  protected async sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
      setTimeout(resolve, ms)
    }) as Promise<void>
  }

  //--------------------------------------------------
  //  共有設定
  //--------------------------------------------------

  /**
   * 共有設定をJSON文字列へ変換します。
   * @param settings
   */
  private m_toShareSettingsString(settings: StorageNodeShareSettings): string | null {
    return JSON.stringify(settings)
  }

  /**
   * 指定されたノードをもとに、上位ディレクトリを加味した共有設定を取得します。
   * @param hierarchicalNodes
   *   階層構造が形成されたノードリストを指定。最後尾のノードの共有設定が取得されます。
   */
  protected getInheritedShareSettings(hierarchicalNodes: GCSStorageNode[]): Required<StorageNodeShareSettings> {
    hierarchicalNodes = this.sortStorageNodes([...hierarchicalNodes])

    const result: Required<StorageNodeShareSettings> = { isPublic: false, readUIds: [], writeUIds: [] }
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
}

//========================================================================
//
//  Exports
//
//========================================================================

export {
  StorageNodeType,
  StoragePaginationOptionsInput,
  StoragePaginationResult,
  StorageNode,
  StorageNodeShareSettings,
  StorageNodeShareSettingsInput,
  SignedUploadUrlInput,
  UploadDataItem,
  StorageUser,
  GCSStorageNode,
  StorageMetadata,
  StorageMetadataInput,
  StorageRawMetadata,
  BaseStorageService,
}
