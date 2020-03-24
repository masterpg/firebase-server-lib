//
// Google Cloud Storage: Node.js Client
// https://googleapis.dev/nodejs/storage/latest/index.html
//

import * as admin from 'firebase-admin'
import * as path from 'path'
import * as shortid from 'shortid'
import { File, SaveOptions } from '@google-cloud/storage'
import {
  GCSStorageNode,
  GetStorageOptionsInput,
  GetStorageResult,
  SignedUploadUrlInput,
  StorageMetadata,
  StorageMetadataInput,
  StorageNode,
  StorageNodeShareSettings,
  StorageNodeShareSettingsInput,
  StorageNodeType,
  StorageRawMetadata,
  UploadDataItem,
} from './types'
import { Request, Response } from 'express'
import { removeBothEndsSlash, removeEndSlash, removeStartSlash, splitHierarchicalPaths } from 'web-base-lib'
import { AuthServiceDI } from '../../nest'
import { Inject } from '@nestjs/common'
import { InputValidationError } from '../../base'
const dayjs = require('dayjs')

const MAX_CHUNK = 50

export class BaseStorageService {
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

    let parentPath = ''
    if (path.dirname(nodePath) !== '.') {
      parentPath = path.dirname(nodePath)
    }

    const _getNode: (pageToken?: string) => Promise<GCSStorageNode | undefined> = async pageToken => {
      const nodeData = await this.getChildMap(basePath, parentPath, { pageToken, maxResults: maxChunk })
      // 引数ノード含め兄弟ノードが存在しない場合、終了
      if (Object.keys(nodeData.dict).length === 0) return undefined
      // 引数ノードが存在する場合、それを戻り値にして終了
      const dirNode = nodeData.dict[nodePath]
      if (dirNode) return dirNode
      // 検索対象が残っていない場合、終了
      if (!nodeData.nextPageToken) return undefined
      // 引数ノードがまだ見つかっていなく、かつまだ検索対象が残っている場合、引き続き検索
      return _getNode(nodeData.nextPageToken)
    }
    return _getNode()
  }

  /**
   * Cloud Storageから指定されたディレクトリと配下のノードを取得します。
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
  async getDirDescendants(basePath: string | null, dirPath?: string, options?: GetStorageOptionsInput): Promise<GetStorageResult> {
    const nodeData = await this.getDirDescendantMap(basePath, dirPath, options)
    return {
      nextPageToken: nodeData.nextPageToken,
      list: this.sortStorageNodes(Object.values(nodeData.dict)),
    }
  }

  /**
   * Cloud Storageから指定されたディレクトリ配下のノードを取得します。
   *
   * 引数が次のように指定された場合、
   *   + basePath: 'home'
   *   + dirPath: 'photos'
   *
   * 次のようなノードが取得されます。
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
  async getDescendants(basePath: string | null, dirPath?: string, options?: GetStorageOptionsInput): Promise<GetStorageResult> {
    const nodeData = await this.getDescendantMap(basePath, dirPath, options)
    return {
      nextPageToken: nodeData.nextPageToken,
      list: this.sortStorageNodes(Object.values(nodeData.dict)),
    }
  }

  /**
   * Cloud Storageから指定されたディレクトリと直下のノードを取得します。
   *
   * 引数が次のように指定された場合、
   *   + basePath: 'home'
   *   + dirPath: 'photos'
   *
   * 次のようなノードが取得されます。
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
  async getDirChildren(basePath: string | null, dirPath?: string, options?: GetStorageOptionsInput): Promise<GetStorageResult> {
    const nodeData = await this.getDirChildMap(basePath, dirPath, options)
    return {
      nextPageToken: nodeData.nextPageToken,
      list: this.sortStorageNodes(Object.values(nodeData.dict)),
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
  async getChildren(basePath: string | null, dirPath?: string, options?: GetStorageOptionsInput): Promise<GetStorageResult> {
    const nodeData = await this.getChildMap(basePath, dirPath, options)
    return {
      nextPageToken: nodeData.nextPageToken,
      list: this.sortStorageNodes(Object.values(nodeData.dict)),
    }
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
        Object.assign(dirNode, await this.saveDirNode(basePath, dirNode))
        result.push(dirNode)
      })
    )

    return this.sortStorageNodes(result)
  }

  /**
   * Cloud Storageへのファイルアップロードの後に必要な処理を行います。
   * @param basePath
   * @param filePaths
   */
  async handleUploadedFiles(basePath: string | null, filePaths: string[]): Promise<void> {
    basePath = removeBothEndsSlash(basePath)

    // 指定されたパスのバリデーションチェック
    filePaths.forEach(filePath => this.validatePath(filePath))

    // 引数ファイルのノードを取得
    const fileNodeDict: { [path: string]: GCSStorageNode } = {}
    await Promise.all(
      filePaths.map(async filePath => {
        // ファイルノードが存在することを確認
        const fileNode = await this.getRealFileNode(basePath, filePath)
        if (!fileNode.exists) {
          throw new Error(`Uploaded file not found: '${path.join(basePath!, filePath)}'`)
        }
        // この時点でファイルノードにIDは振られていないためここで設定
        Object.assign(fileNode, await this.assignIdToNode(basePath, fileNode))
        fileNodeDict[fileNode.path] = fileNode
      })
    )

    // 祖先ディレクトリの穴埋め
    await this.padRealDirNodes(basePath, fileNodeDict, null)
  }

  /**
   * Cloud Storageから指定されたディレクトリを含め配下のノードを削除します。
   *
   * 引数が次のように指定された場合、
   *   + dirPath: 'photos'
   *   + basePath: 'home'
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
   * @param dirPaths
   * @param options
   */
  async removeDirs(basePath: string | null, dirPaths: string[], options?: { maxChunk: number }): Promise<void> {
    const remove = async (basePath: string | null, dirPath: string, pageToken?: string) => {
      basePath = removeBothEndsSlash(basePath)
      dirPath = removeBothEndsSlash(dirPath)
      const { maxChunk } = options || { maxChunk: MAX_CHUNK }

      if (!dirPath) return

      // 引数ディレクトリと配下ノードを取得
      const nodeData = await this.getDirDescendantMap(basePath, dirPath, { pageToken, maxResults: maxChunk })

      // 引数ディレクトリと配下ノードを削除
      const promises: Promise<GCSStorageNode>[] = []
      for (const node of Object.values(nodeData.dict)) {
        if (node.exists) {
          promises.push(node.gcsNode.delete().then(() => node))
        }
      }
      await Promise.all(promises)

      // 配下ノードがまだある場合
      if (nodeData.nextPageToken) {
        await remove(basePath, dirPath, nodeData.nextPageToken)
      }
    }

    for (const dirPath of dirPaths) {
      await remove(basePath, dirPath)
    }
  }

  /**
   * Cloud Storageからファイルノードを削除します。
   *
   * 引数が次のように指定された場合、
   *   + filePaths[0]: 'photos/family.png'
   *   + filePaths[1]: 'photos/children.png'
   *   + basePath: 'home'
   *
   * 次のファイルが削除されます。
   *   + 'home/photos/family.png'
   *   + 'home/photos/children.png'
   *
   * 戻り値は基準パスのノードが除去され、次のようなノードが返されます。
   *   + 'photos/family.png'
   *   + 'photos/children.png'
   *
   * @param basePath
   * @param filePaths
   * @param options
   */
  async removeFiles(basePath: string | null, filePaths: string[], options?: { maxChunk: number }): Promise<void> {
    basePath = removeBothEndsSlash(basePath)
    const { maxChunk } = options || { maxChunk: MAX_CHUNK }

    for (const chunk of this.arrayChunk(filePaths, maxChunk)) {
      await Promise.all(
        chunk.map(async filePath => {
          if (!filePath) return
          const node = await this.getRealFileNode(basePath, filePath)
          if (node.exists) {
            await node.gcsNode.delete()
          }
        })
      )
    }
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
  async moveDir(basePath: string | null, fromDirPath: string, toDirPath: string, options?: { maxChunk: number }): Promise<void> {
    basePath = removeBothEndsSlash(basePath)
    fromDirPath = removeBothEndsSlash(fromDirPath)
    toDirPath = removeBothEndsSlash(toDirPath)
    const { maxChunk } = options || { maxChunk: MAX_CHUNK }

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

    //
    // 移動元ディレクトリの配下ノードの移動処理
    //
    const moveDescendants = async (pageToken?: string) => {
      // 配下ノードを取得
      const nodeData = await this.getDescendantMap(basePath, fromDirPath, { maxResults: maxChunk, pageToken })

      // 配下ノードの移動処理
      const promises: Promise<void>[] = []
      for (const node of Object.values(nodeData.dict)) {
        const promise = (async () => {
          // 移動元ノードのパスを移動先のパスへ変換
          const reg = new RegExp(`^${fromDirPath}`)
          const newNodePath = node.path.replace(reg, toDirPath)
          switch (node.nodeType) {
            // 移動ノードがディレクトリの場合
            case StorageNodeType.Dir: {
              await node.gcsNode.move(path.join(basePath!, newNodePath, '/'))
              break
            }
            // 移動ノードがファイルの場合
            case StorageNodeType.File: {
              await node.gcsNode.move(path.join(basePath!, newNodePath))
              break
            }
          }
        })()
        promises.push(promise)
      }
      await Promise.all(promises)

      // 配下ノードがまだある場合
      if (nodeData.nextPageToken) {
        await moveDescendants(nodeData.nextPageToken)
      }
    }
    await moveDescendants()

    //
    // 移動元ディレクトリの移動処理
    //
    const newDirNodePath = path.join(toDirPath, '/')
    await dirNode.gcsNode.move(path.join(basePath, newDirNodePath))
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
  async moveFile(basePath: string | null, fromFilePath: string, toFilePath: string): Promise<void> {
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
    const toDirPath = path.join(path.dirname(toFilePath))
    const toDirNode = await this.getRealDirNode(basePath, toDirPath)
    if (!toDirNode.exists) {
      throw new Error(`The destination directory does not exist: '${path.join(basePath, toDirNode.path)}'`)
    }

    // 移動元ディレクトリの取得
    const fromDirNode = await this.getRealDirNode(basePath, fileNode.dir)

    // ファイルの移動
    await fileNode.gcsNode.move(path.join(basePath, toFilePath))
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
   */
  async renameDir(basePath: string | null, dirPath: string, newName: string): Promise<void> {
    dirPath = removeBothEndsSlash(dirPath)

    this.validateDirName(newName)

    // リネームした際のパスを作成
    const reg = new RegExp(`${path.basename(dirPath)}$`)
    const toDirPath = dirPath.replace(reg, newName)

    // 既に同じ名前のディレクトリがある場合
    const toDirNode = await this.getRealDirNode(basePath, toDirPath)
    if (toDirNode.exists) {
      throw new Error(`The specified directory name already exists: '${dirPath}' -> '${toDirPath}'`)
    }

    await this.moveDir(basePath, dirPath, toDirPath)
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
  async renameFile(basePath: string | null, filePath: string, newName: string): Promise<void> {
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

    await this.moveFile(basePath, filePath, toFilePath)
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

    const share: StorageNodeShareSettings = { isPublic: undefined, uids: undefined }
    if (settings) {
      if (typeof settings.isPublic === 'boolean') {
        share.isPublic = settings.isPublic
      }
      if (settings.uids) {
        share.uids = settings.uids
      }
    }
    Object.assign(dirNode, await this.saveMetadata(basePath, dirNode, { share }))

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

    const share: StorageNodeShareSettings = { isPublic: undefined, uids: undefined }
    if (settings) {
      if (typeof settings.isPublic === 'boolean') {
        share.isPublic = settings.isPublic
      }
      if (settings.uids) {
        share.uids = settings.uids
      }
    }
    Object.assign(fileNode, await this.saveMetadata(basePath, fileNode, { share }))

    return fileNode
  }

  /**
   * 署名付きのアップロードURLを取得します。
   * @param requestOrigin
   * @param inputs
   */
  async getSignedUploadUrls(requestOrigin: string, inputs: SignedUploadUrlInput[]): Promise<string[]> {
    const bucket = admin.storage().bucket()
    const urlMap: { [path: string]: string } = {}

    for (const input of inputs) {
      const { filePath, contentType } = input
      const gcsFileNode = bucket.file(filePath)
      const [url] = await gcsFileNode.createResumableUpload({
        origin: requestOrigin,
        metadata: { contentType },
      })
      urlMap[filePath] = url
    }

    return inputs.map(input => urlMap[input.filePath])
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
    const [exists] = await gcsNode.exists()

    const result = this.toStorageNode(basePath, gcsNode) as GCSStorageNode
    result.exists = exists

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

    const lastModified = dayjs(fileNode.gcsNode.metadata.updated).toString()
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

    const uploadedFileMap: { [path: string]: GCSStorageNode } = {}
    const promises: Promise<void>[] = []
    for (const uploadItem of uploadList) {
      const destination = path.join(basePath, removeBothEndsSlash(uploadItem.toFilePath))
      promises.push(
        bucket.upload(uploadItem.localFilePath, { destination }).then(async response => {
          const [file, metadata] = response
          const fileNode = this.toStorageNode(basePath, file)
          Object.assign(fileNode, await this.assignIdToNode(basePath, fileNode))
          uploadedFileMap[fileNode.path] = fileNode
        })
      )
    }
    await Promise.all(promises)

    return uploadList.reduce<GCSStorageNode[]>((result, item) => {
      result.push(uploadedFileMap[removeStartSlash(item.toFilePath)])
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

    const uploadedFileMap: { [path: string]: GCSStorageNode } = {}
    const promises: Promise<void>[] = []
    for (const uploadItem of uploadList) {
      promises.push(
        (async () => {
          const gcsFileNode = bucket.file(path.join(basePath, uploadItem.path))
          const fileNode = this.toStorageNode(basePath, gcsFileNode)
          const options = { contentType: uploadItem.contentType }
          Object.assign(fileNode, await this.saveFileNode(basePath, fileNode, uploadItem.data, options))
          uploadedFileMap[fileNode.path] = fileNode
        })()
      )
    }
    await Promise.all(promises)

    return uploadList.reduce<GCSStorageNode[]>((result, item) => {
      result.push(uploadedFileMap[removeStartSlash(item.path)])
      return result
    }, [])
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  /**
   * Cloud Storageから指定されたディレクトリ配下のノードをマップ形式取得します。
   * @param basePath
   * @param dirPath
   * @param options
   */
  async getDirDescendantMap(
    basePath: string | null,
    dirPath?: string,
    options?: GetStorageOptionsInput
  ): Promise<{ nextPageToken?: string; dict: { [path: string]: GCSStorageNode } }> {
    basePath = removeBothEndsSlash(basePath)
    dirPath = removeBothEndsSlash(dirPath)
    options = Object.assign({ maxResults: MAX_CHUNK }, options)

    // 引数のディレクトリパスをCloud Storageのパスへ変換
    let gcsDirPath = ''
    if (basePath || dirPath) {
      gcsDirPath = path.join(basePath, dirPath, '/')
    }

    // Cloud Storageから指定されたディレクトリのノードを取得
    const bucket = admin.storage().bucket()
    const [gcsNodes, , apiResponse] = await bucket.getFiles(Object.assign(options, { prefix: gcsDirPath }))
    if (gcsNodes.length === 0) return { dict: {} }

    const dict: { [path: string]: GCSStorageNode } = {}

    for (const gcsNode of gcsNodes) {
      // basePathが指定されかつ、basePathと取得ノードが一致した場合、無視する
      if (basePath && `${basePath}/` === gcsNode.name) {
        continue
      }

      const node = this.toStorageNode(basePath, gcsNode)
      node.exists = true

      // ノードにIDが振られていない場合、IDを採番
      // ※Cloud Storageに手動でディレクトリ作成またはアップロードされた場合がこの状況にあたる
      if (!node.id) {
        Object.assign(node, await this.assignIdToNode(basePath, node))
      }

      dict[node.path] = node
    }

    // 配下ディレクトリの穴埋め
    Object.assign(dict, await this.padRealDirNodes(basePath, dict, dirPath))

    return { dict, nextPageToken: apiResponse.nextPageToken }
  }

  /**
   * Cloud Storageから指定されたディレクトリ配下のノードをマップ形式取得します。
   * @param basePath
   * @param dirPath
   * @param options
   */
  async getDescendantMap(
    basePath: string | null,
    dirPath?: string,
    options?: GetStorageOptionsInput
  ): Promise<{ nextPageToken?: string; dict: { [path: string]: GCSStorageNode } }> {
    basePath = removeBothEndsSlash(basePath)
    dirPath = removeBothEndsSlash(dirPath)

    const nodeData = await this.getDirDescendantMap(basePath, dirPath, options)
    if (dirPath) {
      delete nodeData.dict[dirPath]
    }
    return nodeData
  }

  /**
   * Cloud Storageから指定されたディレクトリ直下のノードをマップ形式取得します。
   * @param basePath
   * @param dirPath
   * @param options
   */
  protected async getDirChildMap(
    basePath: string | null,
    dirPath?: string,
    options?: GetStorageOptionsInput
  ): Promise<{ nextPageToken?: string; dict: { [path: string]: GCSStorageNode } }> {
    basePath = removeBothEndsSlash(basePath)
    dirPath = removeBothEndsSlash(dirPath)
    options = Object.assign({ maxResults: MAX_CHUNK }, options)

    // 引数ディレクトリパスをCloud Storageのパスへ変換
    let gcsDirPath = ''
    if (basePath || dirPath) {
      gcsDirPath = path.join(basePath, dirPath, '/')
    }

    // Cloud Storageから指定されたディレクトリのノードを取得
    const bucket = admin.storage().bucket()
    const [gcsNodes, _, apiResponse] = await bucket.getFiles(
      Object.assign(options, {
        prefix: gcsDirPath,
        autoPaginate: false,
        delimiter: '/',
      })
    )

    // 指定されたディレクトリと直下のファイルを処理
    // ※ここでは直下のディレクトリは処理されない
    const children1 = await Promise.all(
      gcsNodes.map(async gcsNode => {
        // basePathが指定されかつ、basePathと取得ノードが一致した場合、無視する
        if (basePath && `${basePath}/` === gcsNode.name) {
          return
        }

        const node = this.toStorageNode(basePath, gcsNode) as GCSStorageNode
        node.exists = true

        // ファイルにIDが振られていない場合は設定
        // ※Cloud Storageに手動でアップロードされた場合がこの状況にあたる
        if (!node.id) {
          Object.assign(node, await this.assignIdToNode(basePath, node))
        }

        return node
      })
    )

    // 直下のディレクトリを処理
    const prefixes: string[] = apiResponse.prefixes || []
    const children2 = await Promise.all(
      prefixes.map(async dirPath => {
        // basePathが指定された場合、basePathを取り除く
        if (basePath) {
          dirPath = dirPath.replace(path.join(basePath, '/'), '')
        }
        const childDirNode = await this.getRealDirNode(basePath, dirPath)

        // ディレクトリが存在しない場合、ディレクトリを作成
        // ※Cloud Storageに手動でアップロードされた場合がこの状況にあたる
        if (!childDirNode.exists) {
          Object.assign(childDirNode, await this.saveDirNode(basePath, childDirNode))
        }

        // ディレクトリにIDが振られていない場合は設定
        // ※Cloud Storageに手動でディレクトリが作成された場合がこの状況にあたる
        if (!childDirNode.id) {
          Object.assign(childDirNode, await this.assignIdToNode(basePath, childDirNode))
        }

        return childDirNode
      })
    )

    // 取得したノードをマップ化
    let dirNode: GCSStorageNode | undefined = undefined
    const dict: { [path: string]: GCSStorageNode } = {}
    for (const node of [...children1, ...children2]) {
      if (!node) continue
      dict[node.path] = node
      // 引数ディレクトリの場合
      if (node.gcsNode.name === gcsDirPath) {
        dirNode = node
      }
    }

    // 引数ディレクトリが指定されている場合
    if (dirPath) {
      // 引数ディレクトリが存在しないのに、直下ノードが存在する場合
      if (!dirNode && Object.keys(dict).length > 0) {
        // 引数ディレクトリを作成
        dirNode = await this.getRealDirNode(basePath, dirPath)
        Object.assign(dirNode, await this.saveDirNode(basePath, dirNode))
        dict[dirNode.path] = dirNode
      }
    }

    return { dict, nextPageToken: apiResponse.nextPageToken }
  }

  /**
   * Cloud Storageから指定されたディレクトリと直下のノードをマップ形式取得します。
   * @param basePath
   * @param dirPath
   * @param options
   */
  protected async getChildMap(
    basePath: string | null,
    dirPath?: string,
    options?: GetStorageOptionsInput
  ): Promise<{ nextPageToken?: string; dict: { [path: string]: GCSStorageNode } }> {
    basePath = removeBothEndsSlash(basePath)
    dirPath = removeBothEndsSlash(dirPath)

    const nodeData = await this.getDirChildMap(basePath, dirPath, options)
    if (dirPath) {
      delete nodeData.dict[dirPath]
    }
    return nodeData
  }

  /**
   * Cloud Storageへディレクトリノードを保存します。
   * @param basePath
   * @param dirNode
   * @param metadata
   */
  protected async saveDirNode(
    basePath: string | null,
    dirNode: GCSStorageNode,
    metadata?: Omit<StorageMetadataInput, 'id'>
  ): Promise<GCSStorageNode> {
    if (dirNode.nodeType !== StorageNodeType.Dir) {
      throw new Error(`The specified node is not directory: { path: '${dirNode.path}', nodeType: '${dirNode.nodeType}' }`)
    }

    const result = Object.assign({}, dirNode)

    const _metadata = (metadata || {}) as StorageMetadataInput

    // idが設定されている場合、そのidを引き続き設定
    if (result.id) {
      _metadata.id = result.id
    }
    // idが設定されていない場合、idを生成して設定
    else {
      _metadata.id = shortid.generate()
    }

    // Cloud Storageへノードを保存
    // TODO saveとsaveMetadataを別にした理由: saveにメタデータを指定すると、単体テストでメタデータが保存されない状態がごくまれに発生するため別にしている。
    if (!result.exists) {
      await result.gcsNode.save('')
    }
    Object.assign(result, await this.saveMetadata(basePath, result, _metadata))
    result.exists = true

    return result
  }

  /**
   * Cloud Storageへファイルノードを保存します。
   * @param basePath
   * @param fileNode
   * @param data
   * @param options
   * @param metadata
   */
  protected async saveFileNode(
    basePath: string | null,
    fileNode: GCSStorageNode,
    data: any,
    options: SaveOptions,
    metadata?: Omit<StorageMetadataInput, 'id'>
  ): Promise<GCSStorageNode> {
    if (fileNode.nodeType !== StorageNodeType.File) {
      throw new Error(`The specified node is not file: { path: '${fileNode.path}', nodeType: '${fileNode.nodeType}' }`)
    }

    const result = Object.assign({}, fileNode)

    const _metadata = (metadata || {}) as StorageMetadataInput

    // idが設定されている場合、そのidを引き続き設定
    if (result.id) {
      _metadata.id = result.id
    }
    // idが設定されていない場合、idを生成して設定
    else {
      _metadata.id = shortid.generate()
    }

    // Cloud Storageへノードを保存
    // TODO saveとsaveMetadataを別にした理由: saveにメタデータを指定すると、単体テストでメタデータが保存されない状態がごくまれに発生するため別にしている。
    await result.gcsNode.save(data, options)
    Object.assign(result, await this.saveMetadata(basePath, result, _metadata))
    result.exists = true

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
      created: dayjs(gcsNode.metadata.timeCreated),
      updated: dayjs(gcsNode.metadata.updated),
      exists: false,
      gcsNode: gcsNode,
    }
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
   * 親ディレクトリがない場合、仮想的にディレクトリを作成して穴埋めします。
   * このようなことを行う理由として、Cloud Storageは親ディレクトリが存在しないことがあるためです。
   * 例えば、'aaa/bbb/family.png'の場合、'aaa/bbb/'というディレクトリがない場合があります。
   * このように親ディレクトリがない場合、仮想的にディレクトリを作成して穴埋めします。
   *
   * `topPath`は最上位のパスで、このパスより上位のディレクトリは作成しません。
   * 例えば、'aaa/bbb/ccc/family.png'というノードがあり、ディレクトリが存在しないとします。
   * この条件で`topPath`に'aaa/bbb'を指定すると次のようなディレクトリノードが作成されます。
   * + 'aaa' ← 最上位パスより上なので作成されない
   * + 'aaa/bbb' ← 作成される
   * + 'aaa/bbb/ccc' ← 作成される
   *
   * @param basePath
   * @param nodeDict
   * @param topPath
   */
  protected async padVirtualDirNodes(
    basePath: string | null,
    nodeDict: { [path: string]: GCSStorageNode },
    topPath: string | null
  ): Promise<{ [path: string]: GCSStorageNode }> {
    basePath = removeBothEndsSlash(basePath)
    topPath = removeBothEndsSlash(topPath)

    // 指定された全ノードの階層的なディレクトリパスを取得
    const dirPaths = Object.values(nodeDict).map(node => node.dir)
    const hierarchicalDirPaths = splitHierarchicalPaths(...dirPaths, topPath || '')

    // 欠けているディレクトリパスを取得
    const lackDirPaths: string[] = []
    for (const dirPath of hierarchicalDirPaths) {
      // 引数で最上位パスが指定されている場合
      if (topPath) {
        // ループパスが最上位パスより上位の場合、スルー
        // ※ ｢dirPath: 'd1', topPath: 'd1/d11'｣ の場合、dirPathはtopPathより上位のノードとなる
        if (!dirPath.startsWith(topPath)) continue
      }

      // ループパスのノードが既に存在する場合はスルー
      if (nodeDict[dirPath]) {
        continue
      }
      lackDirPaths.push(dirPath)
    }

    const result: { [path: string]: GCSStorageNode } = {}

    const promises: Promise<void>[] = []
    for (const lackDirPath of lackDirPaths) {
      const promise = (async () => {
        const dirNode = await this.getRealDirNode(basePath, lackDirPath)
        result[dirNode.path] = dirNode
      })()
      promises.push(promise)
    }
    await Promise.all(promises)

    return result
  }

  /**
   * 親ディレクトリがない場合、実際にディレクトリを作成して穴埋めします。
   *
   * @see LibStorageService.padVirtualDirNodes
   * @param basePath
   * @param nodeDict
   * @param topPath
   */
  protected async padRealDirNodes(
    basePath: string | null,
    nodeDict: { [path: string]: GCSStorageNode },
    topPath: string | null
  ): Promise<{ [path: string]: GCSStorageNode }> {
    const paddedNodeMap = await this.padVirtualDirNodes(basePath, nodeDict, topPath)
    const result = Object.assign({}, nodeDict, paddedNodeMap)
    await Promise.all(
      Object.values(result).map(async node => {
        // ディレクトリが実際には存在しない場合、ディレクトリを作成
        if (!node.exists) {
          Object.assign(node, await this.saveDirNode(basePath, node))
        }
        // ディレクトリにIDが振られていない場合、IDを採番
        // ※Cloud Storageに手動でディレクトリが作成された場合がこの状況にあたる
        if (!node.id) {
          Object.assign(node, await this.assignIdToNode(basePath, node))
        }
      })
    )
    return result
  }

  /**
   * 指定されたディレクトリの階層構造を形成するのに必要なノードを取得します。
   * @param basePath
   * @param dirs
   */
  protected async getHierarchicalDirNodes(basePath: string | null, ...dirs: string[] | GCSStorageNode[]): Promise<GCSStorageNode[]> {
    const dirNodeMap: { [path: string]: GCSStorageNode } = {}
    for (const dir of dirs) {
      if (typeof dir === 'string') {
        const dirNode = await this.getRealDirNode(basePath, dir)
        dirNodeMap[dirNode.path] = dirNode
      } else {
        dirNodeMap[dir.path] = dir
      }
    }

    const hierarchicalPaths = splitHierarchicalPaths(...Object.keys(dirNodeMap))
    const hierarchicalNodes: GCSStorageNode[] = [...Object.values(dirNodeMap)]
    await Promise.all(
      hierarchicalPaths.map(async nodePath => {
        if (dirNodeMap[nodePath]) return
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
    const fileNodeMap: { [path: string]: GCSStorageNode } = {}
    for (const file of files) {
      if (typeof file === 'string') {
        const fileNode = await this.getRealFileNode(basePath, file)
        fileNodeMap[fileNode.path] = fileNode
      } else {
        fileNodeMap[file.path] = file
      }
    }

    const hierarchicalPaths = splitHierarchicalPaths(...Object.keys(fileNodeMap))
    const hierarchicalNodes: GCSStorageNode[] = [...Object.values(fileNodeMap)]
    await Promise.all(
      hierarchicalPaths.map(async nodePath => {
        if (fileNodeMap[nodePath]) return
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

  /**
   *
   * @param array
   * @param size
   */
  protected arrayChunk<T>(array: T[], size = 1): T[][] {
    return array.reduce((result, value, index) => {
      if (index % size) {
        return result
      } else {
        return [...result, array.slice(index, index + size)]
      }
    }, [] as T[][])
  }

  //--------------------------------------------------
  //  メタデータ
  //--------------------------------------------------

  /**
   * ノードにIDを割り当てます。
   * @param basePath
   * @param node
   */
  protected async assignIdToNode(basePath: string | null, node: GCSStorageNode): Promise<GCSStorageNode> {
    if (node.id) return node

    return Object.assign(node, await this.saveMetadata(basePath, node, { id: shortid.generate() }))
  }

  /**
   * 指定されたGCSノードのメタデータを保存します。
   * @param basePath
   * @param node
   * @param metadata
   */
  protected async saveMetadata(basePath: string | null, node: GCSStorageNode, metadata: StorageMetadataInput): Promise<GCSStorageNode> {
    const result = Object.assign({}, node)

    await result.gcsNode.setMetadata({ metadata: this.toRawMetadata(metadata) })

    const exists = result.exists
    Object.assign(result, this.toStorageNode(basePath, result.gcsNode))
    result.exists = exists

    return result
  }

  /**
   * 指定されたGCSノードからメタデータを取得します。
   * @param gcsNode
   */
  protected extractMetaData(gcsNode: File): StorageMetadata {
    const share = this.m_extractShareSettings(gcsNode)

    const result = { id: '', share }
    if (!gcsNode.metadata) return result

    const metadata = gcsNode.metadata.metadata || {}
    return {
      id: metadata.id || '',
      share,
    }
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
        result.share = null
      } else {
        result.share = this.m_toShareSettingsString(metadata.share)
      }
    }

    return result
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
   * 指定されたGCSノードのメタデータから共有設定を抽出します。
   * @param gcsNode
   */
  private m_extractShareSettings(gcsNode: File): StorageNodeShareSettings {
    let result: StorageNodeShareSettings = { isPublic: undefined, uids: undefined }

    if (gcsNode.metadata.metadata && gcsNode.metadata.metadata.share) {
      try {
        result = JSON.parse(gcsNode.metadata.metadata.share)
      } catch (err) {
        // TODO どのようにログ出力するか検討が必要!!!
      }
    }

    return result
  }

  /**
   * 指定されたノードをもとに、上位ディレクトリを加味した共有設定を取得します。
   * @param hierarchicalNodes
   *   階層構造が形成されたノードリストを指定。最後尾のノードの共有設定が取得されます。
   */
  protected getInheritedShareSettings(hierarchicalNodes: GCSStorageNode[]): Required<StorageNodeShareSettings> {
    hierarchicalNodes = this.sortStorageNodes([...hierarchicalNodes])

    const result: Required<StorageNodeShareSettings> = { isPublic: false, uids: [] }
    for (let i = hierarchicalNodes.length - 1; i >= 0; i--) {
      const node = hierarchicalNodes[i]
      if (node.share.isPublic) {
        result.isPublic = true
      }
      if (node.share.uids) {
        result.uids = node.share.uids
      }
    }

    return result
  }
}
