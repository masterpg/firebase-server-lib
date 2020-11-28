import * as admin from 'firebase-admin'
import * as path from 'path'
import { AuthServiceDI, AuthServiceModule } from './auth'
import { File, SaveOptions } from '@google-cloud/storage'
import { Inject, Module } from '@nestjs/common'
import { InputValidationError, validateUID } from '../../base'
import { Request, Response } from 'express'
import { RequiredAre, arrayToDict, removeBothEndsSlash, removeStartDirChars, splitArrayChunk, splitHierarchicalPaths } from 'web-base-lib'
import { StorageNode, StorageNodeShareSettings, StorageNodeType, StoreServiceDI, StoreServiceModule } from './store'
import { FieldValue } from '../../../firestore-ex'
import dayjs = require('dayjs')

//========================================================================
//
//  Interfaces
//
//========================================================================

//--------------------------------------------------
//  For GraphQL
//--------------------------------------------------

interface StoragePaginationInput {
  maxChunk?: number
  pageToken?: string
}

interface StoragePaginationResult<T extends StorageNode = StorageNode> {
  list: T[]
  nextPageToken?: string
}

interface StorageNodeShareSettingsInput {
  isPublic?: boolean | null
  readUIds?: string[] | null
  writeUIds?: string[] | null
}

interface StorageNodeKeyInput {
  id?: string
  path?: string
}

class SignedUploadUrlInput {
  filePath!: string
  contentType?: string
}

interface CreateStorageNodeInput extends StorageNodeShareSettingsInput {}

//--------------------------------------------------
//  For inside of Storage
//--------------------------------------------------

interface StorageFileNode extends StorageNode {
  file: File
}

interface StorageNodeInput {
  share?: StorageNodeShareSettingsInput
}

interface WriteBaseStorageNode {
  id: string
  name: string
  dir: string
  path: string
  level: number
  share?: StorageNodeShareSettings
  version: number | FieldValue
}

interface StorageUploadDataItem {
  data: string | Buffer
  path: string
  contentType: string
  share?: StorageNodeShareSettingsInput
}

interface StorageFileDetail {
  file: File
  version: number
  exists: boolean
}

interface StorageFileMetadata {
  version: number
}

interface StorageFileMetadataInput {
  version?: number
}

interface StorageFileRawMetadata {
  version: string
}

//========================================================================
//
//  Implementation
//
//========================================================================

class StorageService<NODE extends StorageNode = StorageNode, FILE_NODE extends NODE & StorageFileNode = NODE & StorageFileNode> {
  constructor(
    @Inject(AuthServiceDI.symbol) protected readonly authService: AuthServiceDI.type,
    @Inject(StoreServiceDI.symbol) protected readonly storeService: StoreServiceDI.type
  ) {}

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  /**
   * 指定されたIDのノードを取得します。
   * @param nodeId
   */
  async getNodeById(nodeId: string): Promise<NODE | undefined> {
    if (!nodeId) {
      throw new Error(`'nodeId' is not specified.`)
    }

    return (await this.storeService.storageDao.fetch(nodeId)) as NODE
  }

  /**
   * 指定されたIDのノードを取得します。
   * 指定されたノードが見つからなかった場合、例外がスローされます。
   * @param nodeId
   */
  async sgetNodeById(nodeId: string): Promise<NODE> {
    const node = await this.getNodeById(nodeId)
    if (!node) {
      throw new Error(`There is no node in the specified ID: '${nodeId}'`)
    }
    return node
  }

  /**
   * 指定されたパスのノードを取得します。
   * @param nodePath
   */
  async getNodeByPath(nodePath: string): Promise<NODE | undefined> {
    if (!nodePath) {
      throw new Error(`'nodePath' is not specified.`)
    }
    nodePath = removeBothEndsSlash(nodePath)

    const storeNodes = (await this.storeService.storageDao.where('path', '==', nodePath).fetch()) as NODE[]
    if (storeNodes.length === 0) return

    return storeNodes[0]
  }

  /**
   * 指定されたパスのノードを取得します。
   * 指定されたノードが見つからなかった場合、例外がスローされます。
   * @param nodePath
   */
  async sgetNodeByPath(nodePath: string): Promise<NODE> {
    const node = await this.getNodeByPath(nodePath)
    if (!node) {
      throw new Error(`There is no node in the specified path: '${nodePath}'`)
    }
    return node
  }

  /**
   * 指定されたIDのノードを取得します。
   * @param nodeIds
   */
  async getNodesByIds(nodeIds: string[]): Promise<NODE[]> {
    nodeIds.map(nodeId => {
      if (!nodeId) throw new Error(`'nodeId' is not specified.`)
    })

    const nodeDict: { [path: string]: NODE } = {}
    await Promise.all(
      nodeIds.map(async nodeId => {
        const node = await this.getNodeById(nodeId)
        if (!node) return
        nodeDict[node.id] = node
      })
    )

    return nodeIds.reduce((result, nodePath) => {
      const node = nodeDict[nodePath]
      node && result.push(node)
      return result
    }, [] as NODE[])
  }

  /**
   * 指定されたパスのノードを取得します。
   * @param nodePaths
   */
  async getNodesByPaths(nodePaths: string[]): Promise<NODE[]> {
    if (nodePaths.length === 0) return []
    nodePaths.map(nodePath => {
      if (!nodePath) throw new Error(`'nodePath' is not specified.`)
    })
    nodePaths = nodePaths.map(nodePath => removeBothEndsSlash(nodePath))

    const nodeDict: { [path: string]: NODE } = {}

    if (nodePaths.length <= 10) {
      const nodes = (await this.storeService.storageDao.where('path', 'in', nodePaths).fetch()) as NODE[]
      for (const node of nodes) {
        nodeDict[node.path] = node
      }
    } else {
      await Promise.all(
        nodePaths.map(async nodePath => {
          const node = await this.getNodeByPath(nodePath)
          if (!node) return
          nodeDict[node.path] = node
        })
      )
    }

    return nodePaths.reduce((result, nodePath) => {
      const node = nodeDict[nodePath]
      node && result.push(node)
      return result
    }, [] as NODE[])
  }

  /**
   * 指定されたIDのファイルノードを取得します。
   * @param nodeId
   */
  async getFileNodeById(nodeId: string): Promise<FILE_NODE | undefined> {
    if (!nodeId) {
      throw new Error(`'nodeId' is not specified.`)
    }

    const fileNode = await this.getNodeById(nodeId)
    if (!fileNode) return undefined

    const { file, exists } = await this.getStorageFile(fileNode.path)
    if (!exists) return undefined

    return { ...fileNode, file } as FILE_NODE
  }

  /**
   * 指定されたパスのファイルノードを取得します。
   * @param filePath
   */
  async getFileNodeByPath(filePath: string): Promise<FILE_NODE | undefined> {
    if (!filePath) {
      throw new Error(`'filePath' is not specified.`)
    }

    const fileNode = await this.getNodeByPath(filePath)
    if (!fileNode) return undefined

    const { file, exists } = await this.getStorageFile(fileNode.path)
    if (!exists) return undefined

    return { ...fileNode, file } as FILE_NODE
  }

  /**
   * ストレージのファイルを取得します。
   * @param filePath
   */
  async getStorageFile(filePath: string): Promise<StorageFileDetail> {
    const bucket = admin.storage().bucket()
    const file = bucket.file(filePath)
    const [exists] = await file.exists()
    const metadata = this.extractMetaData(file)

    return { file, ...metadata, exists }
  }

  /**
   * 指定されたディレクトリ＋配下のノードを取得します。
   *
   * 引数が次のように指定された場合、
   *   + dirPath: 'archives/photos'
   *
   * 次のようなノードが取得されます。
   *   + 'archives/photos'
   *   + 'archives/photos/travel'
   *   + 'archives/photos/travel/tokyo.png'
   *   + 'archives/photos/children.png'
   *   + 'archives/photos/family.png'
   *
   * @param dirPath
   * @param input
   */
  async getDirDescendants(dirPath?: string, input?: StoragePaginationInput): Promise<StoragePaginationResult<NODE>> {
    dirPath = removeBothEndsSlash(dirPath)
    const maxChunk = input?.maxChunk || StorageService.MAX_CHUNK
    const offset = input?.pageToken ? Number(input.pageToken) : 0

    let storeNodes: NODE[]

    const query = this.storeService.storageDao.where('path', '>=', dirPath).orderBy('path').limit(maxChunk)
    if (offset) {
      storeNodes = (await query.offset(offset).fetch()) as NODE[]
    } else {
      storeNodes = (await query.fetch()) as NODE[]
    }

    // 初回検索の場合
    if (!input?.pageToken) {
      // 引数で指定されたパスのノードがディレクトリでない場合
      const dirNode = storeNodes.find(node => node.path === dirPath)
      if (dirNode && dirNode.nodeType !== StorageNodeType.Dir) {
        return { list: [] }
      }
    }

    // バケット直下の検索ではない場合
    if (dirPath) {
      // 余分に検索されてしまったノードを除去
      for (let i = 0; i < storeNodes.length; i++) {
        const storeNode = storeNodes[i]
        // ノードが「引数ディレクトリまたは引数ディレクトリ配下ノード」でない場合は除去
        if (!(storeNode.path === dirPath || storeNode.path.startsWith(`${dirPath}/`))) {
          storeNodes.splice(i--, 1)
        }
      }
    }

    let nextPageToken: string | undefined
    if (storeNodes.length === 0 || storeNodes.length < maxChunk) {
      nextPageToken = undefined
    } else {
      nextPageToken = String(offset + storeNodes.length)
    }

    return { nextPageToken, list: storeNodes }
  }

  /**
   * 指定されたディレクトリ配下のノードを取得します。
   *
   * 引数が次のように指定された場合、
   *   + dirPath: 'archives/photos'
   *
   * 次のようなノードが取得されます。
   *   + 'archives/photos/travel'
   *   + 'archives/photos/travel/tokyo.png'
   *   + 'archives/photos/children.png'
   *   + 'archives/photos/family.png'
   *
   * @param dirPath
   * @param input
   */
  async getDescendants(dirPath?: string, input?: StoragePaginationInput): Promise<StoragePaginationResult<NODE>> {
    dirPath = removeBothEndsSlash(dirPath)
    const maxChunk = input?.maxChunk || StorageService.MAX_CHUNK
    const offset = input?.pageToken ? Number(input.pageToken) : 0

    let storeNodes: NODE[] = []

    const query = this.storeService.storageDao.where('path', '>', dirPath).orderBy('path').limit(maxChunk)
    if (offset) {
      storeNodes = (await query.offset(offset).fetch()) as NODE[]
    } else {
      storeNodes = (await query.fetch()) as NODE[]
    }

    // バケット直下の検索ではない場合
    if (dirPath) {
      // 余分に検索されてしまったノードを除去
      for (let i = 0; i < storeNodes.length; i++) {
        const storeNode = storeNodes[i]
        // ノードが「引数ディレクトリ配下ノード」でない場合は除去
        if (!storeNode.path.startsWith(`${dirPath}/`)) {
          storeNodes.splice(i--, 1)
        }
      }
    }

    let nextPageToken: string | undefined
    if (storeNodes.length === 0 || storeNodes.length < maxChunk) {
      nextPageToken = undefined
    } else {
      nextPageToken = String(offset + storeNodes.length)
    }

    return { nextPageToken, list: storeNodes }
  }

  /**
   * 指定されたディレクトリ＋直下のノードを取得します。
   *
   * 引数が次のように指定された場合、
   *   + dirPath: 'archives/photos'
   *
   * 次のようなノードが取得されます。
   *   + 'archives/photos'
   *   + 'archives/photos/family.png'
   *   + 'archives/photos/children.png'
   *
   * @param dirPath
   * @param input
   */
  async getDirChildren(dirPath?: string, input?: StoragePaginationInput): Promise<StoragePaginationResult<NODE>> {
    dirPath = removeBothEndsSlash(dirPath)
    const maxChunk = input?.maxChunk || StorageService.MAX_CHUNK
    const offset = input?.pageToken ? Number(input.pageToken) : 0

    let storeNodes: NODE[] = []

    let levels: number[]
    // バケット直下の検索の場合
    if (!dirPath) {
      levels = [1]
    }
    // バケット直下の検索でない場合
    else {
      // 引数ディレクトリと直下ノードのノードレベルが対象
      const level = StorageService.getNodeLevel(dirPath)
      levels = [level, level + 1]
    }

    const query = this.storeService.storageDao.where('path', '>=', dirPath).where('level', 'in', levels).orderBy('path').limit(maxChunk)
    if (offset) {
      storeNodes = (await query.offset(offset).fetch()) as NODE[]
    } else {
      storeNodes = (await query.fetch()) as NODE[]
    }

    // 初回検索の場合
    if (!input?.pageToken) {
      // 引数で指定されたパスのノードがディレクトリでない場合
      const dirNode = storeNodes.find(node => node.path === dirPath)
      if (dirNode && dirNode.nodeType !== StorageNodeType.Dir) {
        return { list: [] }
      }
    }

    // バケット直下の検索ではない場合
    if (dirPath) {
      // 余分に検索されてしまったノードを除去
      for (let i = 0; i < storeNodes.length; i++) {
        const storeNode = storeNodes[i]
        // ノードが「引数ディレクトリまたは引数ディレクトリ直下ノード」でない場合は除去
        if (!(storeNode.path === dirPath || storeNode.path.startsWith(`${dirPath}/`))) {
          storeNodes.splice(i--, 1)
        }
      }
    }

    let nextPageToken: string | undefined
    if (storeNodes.length === 0 || storeNodes.length < maxChunk) {
      nextPageToken = undefined
    } else {
      nextPageToken = String(offset + storeNodes.length)
    }

    return { nextPageToken, list: storeNodes }
  }

  /**
   * 指定されたディレクトリ直下のノードを取得します。
   *
   * 引数が次のように指定された場合、
   *   + dirPath: 'archives/photos'
   *
   * 次のようなノードが取得されます。
   *   + 'archives/photos/family.png'
   *   + 'archives/photos/children.png'
   *
   * @param dirPath
   * @param input
   */
  async getChildren(dirPath?: string, input?: StoragePaginationInput): Promise<StoragePaginationResult<NODE>> {
    dirPath = removeBothEndsSlash(dirPath)
    const maxChunk = input?.maxChunk || StorageService.MAX_CHUNK
    const offset = input?.pageToken ? Number(input.pageToken) : 0

    let storeNodes: NODE[] = []

    let levels: number[]
    // バケット直下の検索の場合
    if (!dirPath) {
      levels = [1]
    }
    // バケット直下の検索でない場合
    else {
      // 引数ディレクトリ直下のノードレベルが対象
      const level = StorageService.getNodeLevel(dirPath)
      levels = [level + 1]
    }

    const query = this.storeService.storageDao.where('path', '>', dirPath).where('level', 'in', levels).orderBy('path').limit(maxChunk)
    if (offset) {
      storeNodes = (await query.offset(offset).fetch()) as NODE[]
    } else {
      storeNodes = (await query.fetch()) as NODE[]
    }

    // バケット直下の検索ではない場合
    if (dirPath) {
      // 余分に検索されてしまったノードを除去
      for (let i = 0; i < storeNodes.length; i++) {
        const storeNode = storeNodes[i]
        // ノードが「引数ディレクトリ直下ノード」以外の場合は除去
        if (!storeNode.path.startsWith(`${dirPath}/`)) {
          storeNodes.splice(i--, 1)
        }
      }
    }

    let nextPageToken: string | undefined
    if (storeNodes.length === 0 || storeNodes.length < maxChunk) {
      nextPageToken = undefined
    } else {
      nextPageToken = String(offset + storeNodes.length)
    }

    return { nextPageToken, list: storeNodes }
  }

  /**
   * 指定されたノードとノードの階層構造を形成するディレクトリを取得します。
   * @param nodePath
   */
  async getHierarchicalNodes(nodePath: string): Promise<NODE[]> {
    if (!nodePath) return []

    // 引数ノードの祖先ディレクトリを取得
    const ancestorDirPaths = splitHierarchicalPaths(nodePath)
    // 最後尾のノード(引数ノード)のパスを削除
    // ※引数ノードは以下で別に取得するため
    ancestorDirPaths.pop()

    // 引数ノードを取得
    const node = await this.getNodeByPath(nodePath)

    let nodes: NODE[]

    // 引数ノードが存在する場合
    // ※引数ノードが存在するので、祖先ディレクトリも存在しなくてはならない
    if (node) {
      const ancestorDirNodes = await this.getNodesByPaths(ancestorDirPaths)
      // 欠けているディレクトリがあった場合は穴埋めする
      if (ancestorDirNodes.length !== ancestorDirPaths.length) {
        const addedNodes = await this.createHierarchicalDirs(ancestorDirPaths)
        ancestorDirNodes.push(...addedNodes)
      }
      nodes = [...ancestorDirNodes, node]
    }
    // 引数ノードが存在しない場合
    // ※引数ノードは存在しないので、実際に存在する祖先ディレクトリのみを取得する
    else {
      nodes = await this.getNodesByPaths(ancestorDirPaths)
    }

    return StorageService.sortNodes(nodes)
  }

  /**
   * 指定されたノードの階層構造を形成する祖先ディレクトリを取得します。
   * @param nodePath
   */
  async getAncestorDirs(nodePath: string): Promise<NODE[]> {
    if (!nodePath) return []

    nodePath = removeBothEndsSlash(nodePath)

    const result = await this.getHierarchicalNodes(nodePath)
    return result.filter(node => node.path !== nodePath)
  }

  /**
   * ディレクトリを作成します。
   * @param dirPath
   * @param input
   */
  async createDir(dirPath: string, input?: CreateStorageNodeInput): Promise<NODE> {
    // 指定されたパスのバリデーションチェック
    StorageService.validatePath(dirPath)
    dirPath = removeBothEndsSlash(dirPath)

    // 共有設定の入力値を検証
    StorageService.validateShareSettingInput(input)

    // 引数ディレクトリの階層構造形成に必要なノードを取得
    const hierarchicalDirNodes = await this.getRequiredHierarchicalDirNodes(dirPath)
    const ancestorDirNodes = hierarchicalDirNodes.filter(node => node.path !== dirPath)
    const hierarchicalDirNodeDict = arrayToDict(hierarchicalDirNodes, 'path')

    for (const ancestorDirNode of ancestorDirNodes) {
      // 祖先ディレクトリが存在することをチェック
      if (!ancestorDirNode.exists) {
        throw new InputValidationError(`The ancestor directory of the specified directory does not exist.`, {
          specifiedPath: dirPath,
          ancestorPath: ancestorDirNode.path,
        })
      }
    }

    const dirNode = hierarchicalDirNodeDict[dirPath]
    // 引数ディレクトリがまだ存在しない場合
    if (!dirNode.exists) {
      // ディレクトリを作成
      const nodeId = this.storeService.storageDao.docRef().id
      await this.storeService.storageDao.set({
        ...dirNode,
        id: nodeId,
        share: this.toStoreShareSettings(input ?? null),
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
   * ディレクトリを作成します。
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
   * @param dirPaths
   */
  async createHierarchicalDirs(dirPaths: string[]): Promise<NODE[]> {
    // 指定されたパスのバリデーションチェック
    dirPaths.forEach(dirPath => StorageService.validatePath(dirPath))
    dirPaths = dirPaths.map(dirPath => removeBothEndsSlash(dirPath))

    // 引数ディレクトリの階層構造形成に必要なノードを取得
    const hierarchicalDirNodes = await this.getRequiredHierarchicalDirNodes(...dirPaths)

    // ディレクトリを作成
    const result: NODE[] = []
    for (const chunk of splitArrayChunk(hierarchicalDirNodes, StorageService.MAX_CHUNK)) {
      await Promise.all(
        chunk.map(async dirNode => {
          // ディレクトリが存在する場合はディレクトリを作成せず終了
          if (dirNode.exists) return

          // ディレクトリを作成
          const nodeId = await this.storeService.storageDao.add({
            ...dirNode,
            dir: removeStartDirChars(path.dirname(dirNode.path)),
            path: dirNode.path,
            level: StorageService.getNodeLevel(dirNode.path),
            version: FieldValue.increment(1),
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          })
          // ストアに追加された最新ディレクトリを取得
          const addedDirNode = (await this.getNodeById(nodeId))!
          result.push(addedDirNode)
        })
      )
    }

    return StorageService.sortNodes(result)
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
   * @param dirPath
   * @param input
   */
  async removeDir(dirPath: string, input?: StoragePaginationInput): Promise<StoragePaginationResult<NODE>> {
    if (!dirPath) {
      throw new Error(`The argument 'dirPath' is empty.`)
    }

    const maxChunk = input?.maxChunk || StorageService.MAX_CHUNK
    const offset = input?.pageToken ? Number(input.pageToken) : 0

    // ストアから削除対象ノードを取得
    const pagination = await this.getDirDescendants(dirPath, { maxChunk })

    // ストレージとストアからノードを削除
    const removedNodes: NODE[] = []
    for (const chunk of splitArrayChunk(pagination.list, StorageService.MAX_CHUNK)) {
      await Promise.all(
        chunk.map(async storeNode => {
          // ストレージからノードを削除
          const fileDetail = await this.getStorageFile(storeNode.path)
          if (fileDetail.exists) {
            await fileDetail.file.delete()
          }
          // ストアからノードを削除
          await this.storeService.storageDao.delete(storeNode.id)
          removedNodes.push(storeNode)
        })
      )
    }

    let nextPageToken: string | undefined
    if (removedNodes.length === 0 || removedNodes.length < maxChunk) {
      nextPageToken = undefined
    } else {
      nextPageToken = String(offset + removedNodes.length)
    }

    return { nextPageToken, list: removedNodes }
  }

  /**
   * ファイルを削除します。
   * @param filePath
   */
  async removeFile(filePath: string): Promise<FILE_NODE | undefined> {
    if (!filePath) {
      throw new Error(`The argument 'filePath' is empty.`)
    }

    const fileNode = await this.getFileNodeByPath(filePath)
    if (!fileNode) return undefined

    // ストレージからファイルを削除
    await fileNode.file.delete()
    // ストアからファイルを削除
    await this.storeService.storageDao.delete(fileNode.id)

    return fileNode
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
   * @param fromDirPath
   * @param toDirPath
   * @param input
   */
  async moveDir(fromDirPath: string, toDirPath: string, input?: StoragePaginationInput): Promise<StoragePaginationResult<NODE>> {
    fromDirPath = removeBothEndsSlash(fromDirPath)
    toDirPath = removeBothEndsSlash(toDirPath)

    StorageService.validatePath(toDirPath)

    // 移動元と移動先が同じでないことを確認
    if (fromDirPath === toDirPath) {
      throw new Error(`The source and destination are the same: '${fromDirPath}' -> '${toDirPath}'`)
    }

    // 移動先ディレクトリが移動元のサブディレクトリでないことを確認
    // from: aaa/bbb → to: aaa/bbb/ccc/bbb [NG]
    //               → to: aaa/zzz/ccc/bbb [OK]
    if (toDirPath.startsWith(path.join(fromDirPath, '/'))) {
      throw new Error(`The destination directory is its own subdirectory: '${path.join(fromDirPath)}' -> '${path.join(toDirPath)}'`)
    }

    const result: StoragePaginationResult<NODE> = { list: [] }

    //
    // 移動元ディレクトリの移動処理
    //
    if (!input?.pageToken) {
      // 移動元ディレクトリの取得
      const dirNode = await this.getNodeByPath(fromDirPath)
      if (!dirNode) {
        throw new Error(`The source directory does not exist: '${fromDirPath}'`)
      }

      // 移動先の所属ディレクトリの存在確認
      // ※バケット直下への移動時はディレクトリの存在確認はしない
      const toDirParentPath = removeStartDirChars(path.dirname(toDirPath))
      if (toDirParentPath) {
        const toDirParentNode = await this.getNodeByPath(toDirParentPath)
        if (!toDirParentNode) {
          throw new Error(`The destination directory does not exist: '${toDirParentPath}'`)
        }
      }

      // 移動先ディレクトリが既に存在している場合
      const existsToDirNode = await this.getNodeByPath(toDirPath)
      if (existsToDirNode) {
        // 既に存在している移動先ディレクトリは削除
        // ※移動先ディレクトリを削除するだけで、配下ノードは削除しない
        await this.storeService.storageDao.delete(existsToDirNode.id)
      }

      // 移動元ディレクトリを移動先ディレクトリへ移動
      await this.storeService.storageDao.update({
        ...this.getSaveBaseStorageNode({
          id: dirNode.id,
          path: toDirPath,
        }),
      })

      result.list.push((await this.getNodeById(dirNode.id))!)
    }

    //
    // 移動元ディレクトリの配下ノードの移動処理
    //
    // 配下ノードを取得
    const pagination = await this.getDirDescendants(fromDirPath, { maxChunk: input?.maxChunk })
    // 配下ノードの移動処理
    const promises: Promise<NODE>[] = pagination.list.map(async node => {
      // 移動元ノードのパスを移動先のパスへ変換
      const reg = new RegExp(`^${fromDirPath}`)
      const newNodePath = node.path.replace(reg, toDirPath)

      // 移動先ノードが既に存在している場合
      const existsNode = await this.getNodeByPath(newNodePath)
      if (existsNode) {
        // 既に存在している移動先ノードは削除
        // ※移動先ノードを削除するだけで、そのノードがディレクトリでも配下ノードは削除しない
        await this.storeService.storageDao.delete(existsNode.id)
        if (existsNode.nodeType === StorageNodeType.File) {
          const fileDetail = await this.getStorageFile(existsNode.path)
          if (fileDetail.exists) {
            await fileDetail.file.delete()
          }
        }
      }

      // 移動元ノードがファイルの場合、ストレージからファイルを取得しておく
      let file: File | undefined
      if (node.nodeType === StorageNodeType.File) {
        file = (await this.getStorageFile(node.path)).file
      }

      await this.storeService.runBatch(async batch => {
        // 移動元ストアノードを移動先に更新
        await this.storeService.storageDao.update(
          {
            ...this.getSaveBaseStorageNode({
              id: node.id,
              path: newNodePath,
            }),
          },
          batch
        )
        // 移動元ストレージファイルを移動
        if (file) {
          await file.move(newNodePath)
        }
      })
      const updatedNode = (await this.getNodeById(node.id))!

      if (file) {
        file = (await this.getStorageFile(newNodePath)).file
        // 移動したストレージファイルのメタデータを更新
        await this.saveMetadata(file, {
          version: updatedNode.version,
        })
      }

      return updatedNode
    })
    const movedDescendantList = await Promise.all(promises)

    //
    // 戻り値の設定
    //
    result.list.push(...movedDescendantList)
    result.nextPageToken = pagination.nextPageToken

    return result
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
   * @param fromFilePath
   * @param toFilePath
   */
  async moveFile(fromFilePath: string, toFilePath: string): Promise<FILE_NODE> {
    fromFilePath = removeBothEndsSlash(fromFilePath)
    toFilePath = removeBothEndsSlash(toFilePath)

    StorageService.validatePath(toFilePath)

    // 移動元ファイルの存在確認
    const fileNode = await this.getFileNodeByPath(fromFilePath)
    if (!fileNode) {
      throw new Error(`The source file does not exist: '${fromFilePath}'`)
    }

    // 移動先の所属ディレクトリの存在確認
    // ※バケット直下への移動時はディレクトリの存在確認はしない
    const toParentDirPath = removeStartDirChars(path.dirname(toFilePath))
    if (toParentDirPath) {
      const toParentDirNode = await this.getNodeByPath(toParentDirPath)
      if (!toParentDirNode) {
        throw new Error(`The destination directory does not exist: '${toParentDirPath}'`)
      }
    }

    // 移動先に同名のファイルが存在している場合
    const existsNode = await this.getNodeByPath(toFilePath)
    if (existsNode) {
      // 移動先の同名ファイルは削除
      await this.storeService.storageDao.delete(existsNode.id)
      const fileDetail = await this.getStorageFile(existsNode.path)
      if (fileDetail.exists) {
        await fileDetail.file.delete()
      }
    }

    await this.storeService.runBatch(async batch => {
      // 移動元ストアノードを移動先に更新
      await this.storeService.storageDao.update(
        {
          ...this.getSaveBaseStorageNode({
            id: fileNode.id,
            path: toFilePath,
          }),
        },
        batch
      )
      // 移動元ストレージファイルを移動
      await fileNode.file.move(toFilePath)
    })
    Object.assign(fileNode, (await this.getNodeById(fileNode.id))!)
    fileNode.file = (await this.getStorageFile(toFilePath)).file

    // 移動したストレージファイルのメタデータを更新
    await this.saveMetadata(fileNode.file, {
      version: fileNode.version,
    })

    return fileNode
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
   * @param dirPath
   * @param newName
   * @param input
   */
  async renameDir(dirPath: string, newName: string, input?: StoragePaginationInput): Promise<StoragePaginationResult<NODE>> {
    dirPath = removeBothEndsSlash(dirPath)

    StorageService.validateDirName(newName)

    // リネームした際のパスを作成
    const reg = new RegExp(`${path.basename(dirPath)}$`)
    const toDirPath = dirPath.replace(reg, newName)

    // 初回実行の場合
    if (!input || !input.pageToken) {
      // 既に同じ名前のディレクトリがある場合
      const toDirNode = await this.getNodeByPath(toDirPath)
      if (toDirNode) {
        throw new Error(`The specified directory name already exists: '${dirPath}' -> '${toDirPath}'`)
      }
    }

    return await this.moveDir(dirPath, toDirPath, input)
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
   * @param filePath
   * @param newName
   */
  async renameFile(filePath: string, newName: string): Promise<FILE_NODE> {
    filePath = removeBothEndsSlash(filePath)

    StorageService.validateFileName(newName)

    // リネームした際のパスを作成
    const reg = new RegExp(`${path.basename(filePath)}$`)
    const toFilePath = filePath.replace(reg, newName)

    // 既に同じ名前のファイルがある場合
    const toFileNode = await this.getFileNodeByPath(toFilePath)
    if (toFileNode) {
      throw new Error(`The specified file name already exists: '${filePath}' -> '${toFilePath}'`)
    }

    return await this.moveFile(filePath, toFilePath)
  }

  /**
   * ディレクトリに対して共有設定を行います。
   * @param dirPath
   * @param input
   */
  async setDirShareSettings(dirPath: string, input: StorageNodeShareSettingsInput | null): Promise<NODE> {
    dirPath = removeBothEndsSlash(dirPath)

    const dirNode = await this.getNodeByPath(dirPath)
    if (!dirNode) {
      throw new Error(`The specified directory does not exist: '${dirPath}'`)
    }

    StorageService.validateShareSettingInput(input)

    await this.storeService.storageDao.update({
      ...this.getSaveBaseStorageNode({
        id: dirNode.id,
        path: dirPath,
        share: input === null ? null : Object.assign(dirNode.share, input),
      }),
    })

    return (await this.getNodeById(dirNode.id))!
  }

  /**
   * ファイルに対して共有設定を行います。
   * @param filePath
   * @param input
   */
  async setFileShareSettings(filePath: string, input: StorageNodeShareSettingsInput | null): Promise<FILE_NODE> {
    filePath = removeBothEndsSlash(filePath)

    const fileNode = await this.getFileNodeByPath(filePath)
    if (!fileNode) {
      throw new Error(`The specified file does not exist: '${filePath}'`)
    }

    StorageService.validateShareSettingInput(input)

    await this.storeService.storageDao.update({
      ...this.getSaveBaseStorageNode({
        id: fileNode.id,
        path: filePath,
        share: input === null ? null : Object.assign(fileNode.share, input),
      }),
    })
    Object.assign(fileNode, (await this.getNodeById(fileNode.id))!)

    await this.saveMetadata(fileNode.file, {
      version: fileNode.version,
    })

    return fileNode
  }

  /**
   * ファイルアップロードの後に必要な処理を行います。
   * @param filePath
   */
  async handleUploadedFile(filePath: string): Promise<FILE_NODE> {
    // 指定されたパスのバリデーションチェック
    StorageService.validatePath(filePath)

    // ストレージにファイルが存在することを確認
    const { file, exists } = await this.getStorageFile(filePath)
    if (!exists) {
      throw new Error(`Uploaded file not found: '${filePath}'`)
    }

    // ファイルを格納するディレクトリが存在することを検証
    const parentPath = removeStartDirChars(path.dirname(filePath))
    const dirNodes = await this.getRequiredHierarchicalDirNodes(parentPath)
    for (const dirNode of dirNodes) {
      if (!dirNode.exists) {
        // ファイルの祖先であるディレクトリが一部でも欠けている状態では、そのファイルはツリーをだどって
        // 到達できない迷子のファイルになってしまう。このため対象ファイルはストレージから削除する。
        await file.delete()
        // 例外をスロー
        throw new InputValidationError(`The ancestor directory of the file does not exist.`, {
          filePath: filePath,
          ancestorPath: dirNode.path,
        })
      }
    }

    // ファイルノードの作成/更新
    const fileNode = await this.saveFileNode(filePath, file)

    return { ...fileNode, file } as FILE_NODE
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

      // ファイルノードの新バージョン番号を取得
      const fileNode = await this.getNodeByPath(filePath)
      const version = (fileNode?.version ?? 0) + 1

      const gcsFileNode = bucket.file(filePath)
      const [url] = await gcsFileNode.createResumableUpload({
        origin: requestOrigin,
        metadata: {
          contentType,
          metadata: this.toRawMetadata({ version }),
        },
      })
      urlDict[filePath] = url
    }

    return inputs.map(input => urlDict[input.filePath])
  }

  //--------------------------------------------------
  //  Utilities
  //--------------------------------------------------

  /**
   * 指定されたデータをファイルとしてストレージへアップロードします。
   * @param uploadList
   */
  async uploadDataItems(uploadList: StorageUploadDataItem[]): Promise<FILE_NODE[]> {
    const dirPaths = uploadList
      .map(uploadItem => {
        return removeStartDirChars(path.dirname(uploadItem.path))
      })
      .filter(dirPath => Boolean(dirPath))
    const hierarchicalDirNodes = await this.getRequiredHierarchicalDirNodes(...dirPaths)
    for (const dirNode of hierarchicalDirNodes) {
      if (!dirNode.exists) {
        throw new InputValidationError(`The directory '${dirNode.path}' to upload to does not exist.`)
      }
    }

    const uploadedFileDict: { [path: string]: FILE_NODE } = {}
    for (const chunk of splitArrayChunk(uploadList, StorageService.MAX_CHUNK)) {
      await Promise.all(
        chunk.map(async uploadItem => {
          const fileNode = await this.saveStorageFileNode({
            filePath: uploadItem.path,
            dataParams: {
              data: uploadItem.data,
              options: { contentType: uploadItem.contentType },
            },
            share: uploadItem.share,
          })
          uploadedFileDict[fileNode.path] = fileNode
        })
      )
    }

    return uploadList.reduce((result, item) => {
      result.push(uploadedFileDict[item.path])
      return result
    }, [] as FILE_NODE[])
  }

  /**
   * ローカルファイルをストレージへアップロードします。
   * @param uploadList
   */
  async uploadLocalFiles(uploadList: { localFilePath: string; toFilePath: string }[]): Promise<FILE_NODE[]> {
    const dirPaths = uploadList
      .map(uploadItem => {
        return removeStartDirChars(path.dirname(uploadItem.toFilePath))
      })
      .filter(dirPath => Boolean(dirPath))
    const hierarchicalDirNodes = await this.getRequiredHierarchicalDirNodes(...dirPaths)
    for (const dirNode of hierarchicalDirNodes) {
      if (!dirNode.exists) {
        throw new InputValidationError(`The directory '${dirNode.path}' to upload to does not exist.`)
      }
    }

    const uploadedFileDict: { [path: string]: FILE_NODE } = {}
    const bucket = admin.storage().bucket()
    for (const chunk of splitArrayChunk(uploadList, StorageService.MAX_CHUNK)) {
      await Promise.all(
        chunk.map(async uploadItem => {
          const response = await bucket.upload(uploadItem.localFilePath, { destination: uploadItem.toFilePath })
          const [file, metadata] = response
          const fileNode = await this.saveFileNode(uploadItem.toFilePath, file)
          uploadedFileDict[fileNode.path] = fileNode
        })
      )
    }

    return uploadList.reduce<FILE_NODE[]>((result, item) => {
      result.push(uploadedFileDict[item.toFilePath])
      return result
    }, [])
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

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
      fileNode = await this.getFileNodeByPath(filePath)
    } else {
      fileNode = file
    }

    if (!fileNode) {
      return res.sendStatus(404)
    }

    const lastModified = fileNode.updatedAt.toString()
    const ifModifiedSinceStr = req.header('If-Modified-Since')
    const ifModifiedSince = ifModifiedSinceStr ? dayjs(ifModifiedSinceStr).toString() : undefined
    if (lastModified === ifModifiedSince) {
      return res.sendStatus(304)
    }

    res.setHeader('Last-Modified', lastModified)
    res.setHeader('Content-Type', fileNode.contentType)
    // TODO
    //  ローカル環境でContent-Lengthを指定するとなぜかタイムアウトエラーが発生する。
    //  本番環境ではタイムアウトエラーは発生しないので、本番時のみContent-Lengthを設定している。
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Content-Length', fileNode.file.metadata.size)
    }
    const fileStream = fileNode.file.createReadStream()

    fileStream.pipe(res)
    return res
  }

  /**
   * 指定されたディレクトリの階層構造を形成するのに必要なノードを取得します。
   * @param dirPaths
   */
  protected async getRequiredHierarchicalDirNodes(...dirPaths: string[]): Promise<(NODE & { exists: boolean })[]> {
    const hierarchicalPaths = splitHierarchicalPaths(...dirPaths)
    const hierarchicalNodes: (NODE & { exists: boolean })[] = []
    await Promise.all(
      hierarchicalPaths.map(async dirPath => {
        const dirNode = await this.getNodeByPath(dirPath)

        let resultNode: NODE & { exists: boolean }
        if (!dirNode) {
          resultNode = {
            ...this.dirPathToStorageNode(dirPath),
            exists: false,
          }
        } else {
          resultNode = { ...dirNode, exists: true }
        }
        hierarchicalNodes.push(resultNode)
      })
    )

    return StorageService.sortNodes(hierarchicalNodes)
  }

  /**
   * 指定されたノードをもとに、上位ディレクトリを加味た共有設定を取得します。
   * @param hierarchicalNodes
   *   階層構造が形成されたノードリストを指定。最後尾のノードの共有設定が取得されます。
   */
  protected getInheritedShareSettings(hierarchicalNodes: StorageNode[]): Required<StorageNodeShareSettings> {
    hierarchicalNodes = StorageService.sortNodes([...hierarchicalNodes])

    const result: Required<StorageNodeShareSettings> = { isPublic: false, readUIds: null, writeUIds: null }
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

  /**
   * ストレージに格納されているファイルをもとに、ストアのファイルノードを作成/更新します。
   * @param filePath
   * @param file
   * @param input
   */
  protected async saveFileNode(filePath: string, file: File, input?: StorageNodeInput): Promise<FILE_NODE> {
    filePath = removeBothEndsSlash(filePath)

    const existsFileNode = await this.getNodeByPath(filePath)
    const { version } = this.extractMetaData(file)

    // クライアント側ではアップロード前に引数ファイルのメタデータに新バージョン番号が書き込まれる。
    // この新バージョン番頭と現在のストレージファイルのバージョン番号を比較し、
    // 新バージョン番号がストレージファイルと同じまたは古い場合は何もせず終了
    if (existsFileNode && existsFileNode.version >= version) {
      return { ...existsFileNode, file } as FILE_NODE
    }

    const nodeId = existsFileNode?.id ?? this.storeService.storageDao.docRef().id
    await this.storeService.storageDao.set({
      ...(this.getSaveBaseStorageNode({
        id: nodeId,
        path: filePath,
        share: Object.assign({}, input?.share ?? existsFileNode?.share),
      }) as RequiredAre<WriteBaseStorageNode, 'share'>),
      nodeType: StorageNodeType.File,
      contentType: file.metadata.contentType ?? '',
      size: file.metadata.size ? Number(file.metadata.size) : 0,
      articleNodeName: null,
      articleNodeType: null,
      articleSortOrder: null,
      isArticleFile: false,
      version,
      createdAt: existsFileNode?.createdAt ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    return {
      ...((await this.getNodeById(nodeId)) as NODE),
      file,
    } as FILE_NODE
  }

  /**
   * ストレージ/ストアへファイルノードを保存します。
   * @param params
   */
  protected async saveStorageFileNode(
    params: {
      filePath: string
      isArticleFile?: boolean | null
      dataParams: { data: any; options?: SaveOptions }
    } & StorageNodeInput
  ): Promise<FILE_NODE> {
    const filePath = removeBothEndsSlash(params.filePath)
    const isArticleFile = typeof params.isArticleFile === 'boolean' ? params.isArticleFile : null
    const { dataParams, share } = params

    const fileNode = await this.getNodeByPath(filePath)
    const nodeId = fileNode ? fileNode.id : this.storeService.storageDao.docRef().id
    let version = 0

    //
    // ストレージにファイルのコンテンツデータを保存
    //
    const bucket = admin.storage().bucket()
    const file = bucket.file(filePath)

    let metadata: StorageFileMetadata
    if (fileNode) {
      version = fileNode.version + 1
      metadata = {
        ...this.extractMetaData(file),
        version,
      }
    } else {
      version = 1
      metadata = { version }
    }

    await file.save(dataParams.data, dataParams.options)
    await this.saveMetadata(file, metadata)

    //
    // ストアにノードデータを保存
    //
    await this.storeService.storageDao.set({
      ...(this.getSaveBaseStorageNode({
        id: nodeId,
        path: filePath,
        share: Object.assign({}, share ?? fileNode?.share),
      }) as RequiredAre<WriteBaseStorageNode, 'share'>),
      nodeType: StorageNodeType.File,
      contentType: dataParams?.options?.contentType ?? '',
      size: file.metadata.size ? Number(file.metadata.size) : 0,
      articleNodeName: null,
      articleNodeType: null,
      articleSortOrder: null,
      isArticleFile,
      version,
      createdAt: fileNode?.createdAt ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    // 保存されたノードデータを戻り値として返す
    return {
      ...((await this.getNodeById(nodeId)) as NODE),
      file,
    } as FILE_NODE
  }

  /**
   * ストアノード保存時の基本項目が設定されたオブジェクトを取得します。
   * @param node
   */
  protected getSaveBaseStorageNode(node: { id: string; path: string; share?: StorageNodeShareSettingsInput | null }): WriteBaseStorageNode {
    return {
      id: node.id,
      name: path.basename(node.path),
      dir: removeStartDirChars(path.dirname(node.path)),
      path: node.path,
      level: StorageService.getNodeLevel(node.path),
      share: this.toStoreShareSettings(node.share),
      version: FieldValue.increment(1),
    }
  }

  /**
   * 指定された`dirPath`を`StorageNode`へ変換します。
   * @param dirPath
   */
  protected dirPathToStorageNode(dirPath: string): NODE {
    dirPath = removeBothEndsSlash(dirPath)
    const name = path.basename(dirPath)
    const dir = removeStartDirChars(path.dirname(dirPath))

    return {
      id: '',
      nodeType: StorageNodeType.Dir,
      name,
      dir,
      path: dirPath,
      level: StorageService.getNodeLevel(dirPath),
      contentType: '',
      size: 0,
      share: { isPublic: null, readUIds: null, writeUIds: null },
      version: 0,
      createdAt: dayjs(0),
      updatedAt: dayjs(0),
    } as NODE
  }

  /**
   * 共有設定の入力値をストアの格納形式に変換します。
   * @param input
   */
  protected toStoreShareSettings(input?: StorageNodeShareSettingsInput | null): StorageNodeShareSettings {
    let share!: StorageNodeShareSettings

    if (input === null) {
      share = { isPublic: null, readUIds: null, writeUIds: null }
    } else if (input) {
      share = { isPublic: null, readUIds: null, writeUIds: null }
      if (typeof input.isPublic !== 'undefined') {
        share.isPublic = input.isPublic
      }
      if (typeof input.readUIds !== 'undefined') {
        if (Array.isArray(input.readUIds) && input.readUIds.length === 0) {
          share.readUIds = null
        } else {
          share.readUIds = input.readUIds
        }
      }
      if (typeof input.writeUIds !== 'undefined') {
        if (Array.isArray(input.writeUIds) && input.writeUIds.length === 0) {
          share.writeUIds = null
        } else {
          share.writeUIds = input.writeUIds
        }
      }
    }

    return share
  }

  //--------------------------------------------------
  //  Metadata
  //--------------------------------------------------

  /**
   * 指定されたストレージファイルからメタデータを取得します。
   * @param file
   */
  protected extractMetaData(file: File): StorageFileMetadata {
    const metadata = file.metadata.metadata || {}

    const result: StorageFileMetadata = {
      version: metadata.version && !isNaN(metadata.version) ? Number(metadata.version) : 0,
    }

    return result
  }

  /**
   * 指定されたストレージファイルのメタデータを保存します。
   * @param file
   * @param input
   */
  protected async saveMetadata(file: File, input: StorageFileMetadataInput): Promise<StorageFileMetadata> {
    const metadata = this.extractMetaData(file)

    if (typeof input.version === 'number') {
      metadata.version = input.version
    }

    await file.setMetadata({ metadata: this.toRawMetadata(metadata) })

    return metadata
  }

  /**
   * メタデータをGCSへ保存できる形式へ変換します。
   * @param input
   */
  protected toRawMetadata(input: StorageFileMetadataInput): StorageFileRawMetadata {
    const result: StorageFileRawMetadata = { version: '' }

    if (typeof input.version !== 'undefined') {
      result.version = input.version.toString()
    }

    return result
  }

  //----------------------------------------------------------------------
  //
  //  Static
  //
  //----------------------------------------------------------------------

  static MAX_CHUNK = 50

  /**
   * ストアノードレベルを取得します。
   * @param nodePath
   */
  static getNodeLevel(nodePath: string | null): number {
    nodePath = removeBothEndsSlash(nodePath)
    return nodePath.split('/').length
  }

  /**
   * ノードパスのチェックを行います。
   * @param nodePath
   */
  static validatePath(nodePath?: string): void {
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
  static validateDirName(dirName?: string): void {
    this.validatePath(dirName)
    // '/'が含まれないことを検証
    if (/\//g.test(dirName!)) {
      throw new InputValidationError('The specified directory name is invalid.', { dirName })
    }
  }

  /**
   * ファイル名のチェックを行います。
   * @param fileName
   */
  static validateFileName(fileName?: string): void {
    this.validatePath(fileName)
    // '/'が含まれないことを検証
    if (/\//g.test(fileName!)) {
      throw new InputValidationError('The specified file name is invalid.', { fileName })
    }
  }

  /**
   * 共有設定の入力値を検証します。
   * @param input
   */
  static validateShareSettingInput(input?: StorageNodeShareSettingsInput | null): void {
    input?.readUIds?.forEach(uid => {
      if (!validateUID(uid)) {
        throw new Error(`The specified 'readUIds' had an incorrect value: '${uid}'`)
      }
    })

    input?.writeUIds?.forEach(uid => {
      if (!validateUID(uid)) {
        throw new Error(`The specified 'writeUIds' had an incorrect value: '${uid}'`)
      }
    })
  }

  /**
   * ノード配列をディレクトリ階層に従ってソートします。
   * @param nodes
   */
  static sortNodes<NODE extends StorageNode>(nodes: NODE[]): NODE[] {
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

      return strA < strB ? -1 : strA > strB ? 1 : 0
    })
    return nodes
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
  imports: [AuthServiceModule, StoreServiceModule],
})
class StorageServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { StorageService, StorageServiceDI, StorageServiceModule }
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
}
