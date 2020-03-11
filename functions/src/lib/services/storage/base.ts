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
const cloneDeep = require('lodash/cloneDeep')

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
   * Cloud Storageから指定されたディレクトリと配下のノードを取得します。
   *
   * 引数が次のように指定された場合、
   *   + dirPath: 'photos'
   *   + basePath: 'home'
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
   */
  async getHierarchicalDescendants(basePath: string | null, dirPath?: string): Promise<GCSStorageNode[]> {
    basePath = removeBothEndsSlash(basePath)
    dirPath = removeBothEndsSlash(dirPath)

    let nodeMap: { [path: string]: GCSStorageNode }
    //
    // 引数ディレクトリが指定された場合
    //
    if (dirPath) {
      // 引数ディレクトリと配下ノードを取得
      nodeMap = await this.getDirDescendantMap(basePath, dirPath)
      // 引数ディレクトリと配下ノードが存在しない場合
      if (Object.keys(nodeMap).length === 0) {
        // 引数ディレクトリの上位ディレクトリを取得
        const hierarchicalDirPaths = splitHierarchicalPaths(dirPath)
        await Promise.all(
          hierarchicalDirPaths.map(async iDirPath => {
            if (iDirPath === dirPath) return
            const dirNode = await this.getDirNode(basePath, iDirPath)
            if (dirNode.exists) {
              nodeMap[dirNode.path] = dirNode
            }
          })
        )
      }
    }
    //
    // 引数ディレクトリが指定されなかった場合
    //
    else {
      nodeMap = await this.getDescendantMap(basePath, dirPath)
    }

    // 祖先ディレクトリの穴埋め
    Object.assign(nodeMap, await this.padRealDirNodes(basePath, nodeMap, null))

    // ディレクトリ階層を表現できるようノード配列をソート
    return this.sortStorageNodes(Object.values(nodeMap))
  }

  /**
   * Cloud Storageから指定されたディレクトリと直下のノードを階層構造を形成して取得します。
   *
   * 引数が次のように指定された場合、
   *   + dirPath: 'photos'
   *   + basePath: 'home'
   *
   * 次のようなノードが取得されます。
   *   + 'home'
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
   */
  async getHierarchicalChildren(basePath: string | null, dirPath?: string): Promise<GCSStorageNode[]> {
    basePath = removeBothEndsSlash(basePath)
    dirPath = removeBothEndsSlash(dirPath)

    let nodeMap: { [path: string]: GCSStorageNode }
    //
    // 引数ディレクトリが指定された場合
    //
    if (dirPath) {
      // 引数ディレクトリと直下ノードを取得
      nodeMap = await this.getDirChildMap(basePath, dirPath)
      // 引数ディレクトリと直下ノードが存在しない場合
      if (Object.keys(nodeMap).length === 0) {
        // 引数ディレクトリの上位ディレクトリを取得
        const hierarchicalDirPaths = splitHierarchicalPaths(dirPath)
        await Promise.all(
          hierarchicalDirPaths.map(async iDirPath => {
            if (iDirPath === dirPath) return
            const dirNode = await this.getDirNode(basePath, iDirPath)
            if (dirNode.exists) {
              nodeMap[dirNode.path] = dirNode
            }
          })
        )
      }
    }
    //
    // 引数ディレクトリが指定されなかった場合
    //
    else {
      nodeMap = await this.getChildMap(basePath, dirPath)
    }

    // 祖先ディレクトリの穴埋め
    Object.assign(nodeMap, await this.padRealDirNodes(basePath, nodeMap, null))

    // ディレクトリ階層を表現できるようノード配列をソート
    return this.sortStorageNodes(Object.values(nodeMap))
  }

  /**
   * Cloud Storageから指定されたディレクトリ直下のノードを取得します。
   *
   * 引数が次のように指定された場合、
   *   + dirPath: 'photos'
   *   + basePath: 'home'
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
   */
  async getChildren(basePath: string | null, dirPath?: string): Promise<GCSStorageNode[]> {
    // Cloud Storageから指定されたディレクトリのノードを取得
    const nodeMap = await this.getChildMap(basePath, dirPath)
    // ノード配列をソート
    return this.sortStorageNodes(Object.values(nodeMap))
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

    // 引数ディレクトリのノードを取得
    // ※存在する、しないディレクトリが混在する
    const dirNodes = await Promise.all(dirPaths.map(dirPath => this.getDirNode(basePath, dirPath)))

    // 上記で取得したディレクトリノードの階層構造に必要なノードを取得/格納したストアを取得
    const hierarchicalNodeStore = await this.getHierarchicalNodeStore(basePath, dirNodes)

    // ディレクトリを作成
    const result: GCSStorageNode[] = []
    await Promise.all(
      hierarchicalNodeStore.nodes.map(async dirNode => {
        // ディレクトリが存在する場合はディレクトリを作成せず終了
        if (dirNode.exists) return
        // 直近の祖先ディレクトリの共有設定を取得
        const share = hierarchicalNodeStore.getNearestShareSettings(dirNode.path)
        // ディレクトリを作成
        Object.assign(dirNode, await this.saveDirNode(basePath, dirNode, { share }))

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
  async handleUploadedFiles(basePath: string | null, filePaths: string[]): Promise<GCSStorageNode[]> {
    basePath = removeBothEndsSlash(basePath)

    // 指定されたパスのバリデーションチェック
    filePaths.forEach(filePath => this.validatePath(filePath))

    // 引数ファイルのノードを取得
    const fileNodes = await Promise.all(
      filePaths.map(async filePath => {
        // ファイルノードが存在することを確認
        const fileNode = await this.getFileNode(basePath, filePath)
        if (!fileNode.exists) {
          throw new Error(`Uploaded file not found: '${path.join(basePath!, filePath)}'`)
        }
        // この時点でファイルノードにIDは振られていないためここで設定
        Object.assign(fileNode, await this.assignIdToNode(basePath, fileNode))
        return fileNode
      })
    )

    // 引数ファイルノードの階層構造形成に必要なノードを格納したストアを取得
    const hierarchicalNodeStore = await this.getHierarchicalNodeStore(basePath, fileNodes)

    // ディレクトリ作成と共有設定の継承
    const result: GCSStorageNode[] = []
    await Promise.all(
      hierarchicalNodeStore.nodes.map(async node => {
        // 直近の祖先ディレクトリの共有設定を取得
        const share = hierarchicalNodeStore.getNearestShareSettings(node.path)
        switch (node.nodeType) {
          case StorageNodeType.Dir: {
            // ディレクトリが実際に存在する場合、何もせず終了
            if (node.exists) return
            // ディレクトリが実際は存在しない場合、ディレクトリを作成
            Object.assign(node, await this.saveDirNode(basePath, node, { share }))
            break
          }
          case StorageNodeType.File: {
            if (share) {
              Object.assign(node, await this.saveMetadata(basePath, node, { share }))
            }
            break
          }
        }
        result.push(node)
      })
    )

    return this.sortStorageNodes(result)
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
   */
  async removeDirs(basePath: string | null, dirPaths: string[]): Promise<GCSStorageNode[]> {
    const remove = async (basePath: string | null, dirPath: string) => {
      basePath = removeBothEndsSlash(basePath)
      dirPath = removeBothEndsSlash(dirPath)

      if (!dirPath) return []

      // Cloud Storageから指定されたディレクトリのノードを取得
      const nodeMap = await this.getDirDescendantMap(basePath, dirPath)

      // Cloud Storageから取得したノードを削除
      const promises: Promise<GCSStorageNode>[] = []
      for (const node of Object.values(nodeMap)) {
        if (node.exists) {
          promises.push(node.gcsNode.delete().then(() => node))
        }
      }
      return await Promise.all(promises)
    }

    const result: GCSStorageNode[] = []

    for (const dirPath of dirPaths) {
      const nodes = await remove(basePath, dirPath)
      result.push(...nodes)
    }

    this.sortStorageNodes(result)

    return result
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
   */
  async removeFiles(basePath: string | null, filePaths: string[]): Promise<GCSStorageNode[]> {
    basePath = removeBothEndsSlash(basePath)

    const nodeMap: { [path: string]: GCSStorageNode } = {}

    const promises: Promise<void>[] = []
    for (let filePath of filePaths) {
      filePath = removeBothEndsSlash(filePath)
      if (!filePath) continue

      promises.push(
        (async () => {
          const node = await this.getFileNode(basePath, filePath)
          if (node.exists) {
            await node.gcsNode.delete()
            nodeMap[node.path] = node
          }
        })()
      )
    }
    await Promise.all(promises)

    return filePaths.reduce<GCSStorageNode[]>((result, filePath) => {
      const fileNode = nodeMap[removeBothEndsSlash(filePath)]
      fileNode && result.push(fileNode)
      return result
    }, [])
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
   */
  async moveDir(basePath: string | null, fromDirPath: string, toDirPath: string): Promise<GCSStorageNode[]> {
    basePath = removeBothEndsSlash(basePath)
    fromDirPath = removeBothEndsSlash(fromDirPath)
    toDirPath = removeBothEndsSlash(toDirPath)

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
    const dirNode = await this.getDirNode(basePath, fromDirPath)
    if (!dirNode.exists) {
      throw new Error(`The source directory does not exist: '${path.join(basePath, fromDirPath)}'`)
    }

    // 移動先ディレクトリの存在確認
    // (アプリケーションまたはユーザーディレクトリ直下へ移動する場合は確認しない)
    let toDirParentNode: GCSStorageNode | undefined
    if (path.dirname(toDirPath) !== '.') {
      const toDirParentPath = path.join(path.dirname(toDirPath), '/')
      toDirParentNode = await this.getDirNode(basePath, toDirParentPath)
      if (!toDirParentNode.exists) {
        throw new Error(`The destination directory does not exist: '${path.join(basePath, toDirParentNode.path)}'`)
      }
    }

    // 移動元ディレクトリの配下ノードを取得
    const movingDescendantMap = await this.getDescendantMap(basePath, fromDirPath)
    // 古い親ディレクトリの共有設定を移動元ディレクトリ＋配下のノードから削除
    await this.setDirShareSettings(basePath, fromDirPath, null)
    // 新しい親ディレクトリの共有設定を移動元ディレクトリ＋配下のノードに設定
    if (toDirParentNode) {
      await this.setDirShareSettings(basePath, fromDirPath, toDirParentNode.share)
    }

    const resultMap: { [path: string]: GCSStorageNode } = {}

    // 移動元ディレクトリの移動処理
    {
      const newDirNodePath = path.join(toDirPath, '/')
      await dirNode.gcsNode.move(path.join(basePath, newDirNodePath))
      const newDirNode = (await this.getDirNode(basePath, newDirNodePath))!
      resultMap[newDirNode.path] = newDirNode
    }

    // 移動元ディレクトリ配下のノードの移動処理
    {
      const promises: Promise<void>[] = []
      for (const node of Object.values(movingDescendantMap)) {
        const promise = (async () => {
          // 移動元ノードのパスを移動先のパスへ変換
          const reg = new RegExp(`^${fromDirPath}`)
          const newNodePath = node.path.replace(reg, toDirPath)
          // 移動ノードがディレクトリの場合
          if (node.nodeType === StorageNodeType.Dir) {
            await node.gcsNode.move(path.join(basePath, newNodePath, '/'))
            const movedNode = (await this.getDirNode(basePath, newNodePath))!
            resultMap[movedNode.path] = movedNode
          }
          // ノードがファイルの場合
          else {
            await node.gcsNode.move(path.join(basePath, newNodePath))
            const movedNode = await this.getFileNode(basePath, newNodePath)
            resultMap[movedNode.path] = movedNode
          }
        })()
        promises.push(promise)
      }
      await Promise.all(promises)
    }

    // 移動を行ったノード一覧をソート
    return this.sortStorageNodes(Object.values(resultMap))
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
    const fileNode = await this.getFileNode(basePath, fromFilePath)
    if (!fileNode.exists) {
      throw new Error(`The source file does not exist: '${path.join(basePath, fileNode.path)}'`)
    }

    // 移動先ディレクトリの存在確認
    const toDirPath = path.join(path.dirname(toFilePath))
    const toDirNode = await this.getDirNode(basePath, toDirPath)
    if (!toDirNode.exists) {
      throw new Error(`The destination directory does not exist: '${path.join(basePath, toDirNode.path)}'`)
    }

    // 移動元ディレクトリの取得
    const fromDirNode = await this.getDirNode(basePath, fileNode.dir)

    // ファイルの移動
    await fileNode.gcsNode.move(path.join(basePath, toFilePath))

    // 移動先ディレクトリの共有設定を継承
    this.m_mergeShareSettings(fileNode.share, fromDirNode.share, toDirNode.share)
    const result = await this.setFileShareSettings(basePath, toFilePath, fileNode.share)

    return result
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
  async renameDir(basePath: string | null, dirPath: string, newName: string): Promise<GCSStorageNode[]> {
    dirPath = removeBothEndsSlash(dirPath)

    this.validateDirName(newName)

    // リネームした際のパスを作成
    const reg = new RegExp(`${path.basename(dirPath)}$`)
    const toDirPath = dirPath.replace(reg, newName)

    // 既に同じ名前のディレクトリがある場合
    const toDirNode = await this.getDirNode(basePath, toDirPath)
    if (toDirNode.exists) {
      throw new Error(`The specified directory name already exists: '${dirPath}' -> '${toDirPath}'`)
    }

    return this.moveDir(basePath, dirPath, toDirPath)
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
    const toFileNode = await this.getFileNode(basePath, toFilePath)
    if (toFileNode.exists) {
      throw new Error(`The specified file name already exists: '${filePath}' -> '${toFilePath}'`)
    }

    return this.moveFile(basePath, filePath, toFilePath)
  }

  /**
   * Cloud Storageのディレクトリに対して共有設定を行います。
   * @param basePath
   * @param dirPath
   * @param settings
   */
  async setDirShareSettings(basePath: string | null, dirPath: string, settings: StorageNodeShareSettingsInput | null): Promise<GCSStorageNode[]> {
    basePath = removeBothEndsSlash(basePath)
    dirPath = removeBothEndsSlash(dirPath)

    // 引数ディレクトリと配下ノードを取得
    const descendantMap = await this.getDirDescendantMap(basePath, dirPath)
    if (Object.keys(descendantMap).length === 0) {
      return []
    }
    const dirNode = descendantMap[dirPath]
    // 引数ディレクトリと配下のノードは別処理を行うので、descendantMapから引数ディレクトリを削除
    delete descendantMap[dirPath]

    const result: GCSStorageNode[] = []

    //
    // 引数ディレクトリの共有設定
    //
    const oldDirSettings = dirNode.share
    const newDirSettings: StorageNodeShareSettings = cloneDeep(dirNode.share)
    if (settings === null) {
      newDirSettings.isPublic = false
      newDirSettings.uids = []
    } else {
      if (typeof settings.isPublic === 'boolean') {
        newDirSettings.isPublic = settings.isPublic
      }
      if (settings.uids) {
        newDirSettings.uids = settings.uids
      }
    }
    Object.assign(dirNode, await this.saveMetadata(basePath, dirNode, { share: newDirSettings }))
    result.push(dirNode)

    //
    // 引数ディレクトリの配下ノードの共有設定
    //
    const promises: Promise<void>[] = []
    for (const descendantNode of Object.values(descendantMap)) {
      const promise = (async () => {
        const newSettings = cloneDeep(descendantNode.share)
        // ループノードの共有設定と前回/今回の親ディレクトリの共有設定をマージする
        this.m_mergeShareSettings(newSettings, oldDirSettings, newDirSettings)
        // 現ノードの共有設定を保存
        Object.assign(descendantNode, await this.saveMetadata(basePath, descendantNode, { share: newSettings }))

        result.push(descendantNode)
      })()
      promises.push(promise)
    }
    await Promise.all(promises)

    return this.sortStorageNodes(result)
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

    const fileNode = await this.getFileNode(basePath, filePath)
    if (!fileNode.exists) {
      throw new Error(`The specified file does not exist: '${path.join(basePath, filePath)}'`)
    }

    const share: StorageNodeShareSettings = { isPublic: false, uids: [] }
    if (settings && typeof settings.isPublic === 'boolean') {
      share.isPublic = settings.isPublic
    }
    if (settings && settings.uids) {
      share.uids = settings.uids
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
  async getNode(basePath: string | null, nodePath: string): Promise<GCSStorageNode> {
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
   * Cloud Storageからディレクトリノードを取得します。
   * @param basePath
   * @param dirPath
   */
  async getDirNode(basePath: string | null, dirPath: string): Promise<GCSStorageNode> {
    return this.getNode(basePath, path.join(dirPath, '/'))
  }

  /**
   * Cloud Storageからファイルノードを取得します。
   * @param basePath
   * @param filePath
   */
  async getFileNode(basePath: string | null, filePath: string): Promise<GCSStorageNode> {
    return this.getNode(basePath, removeEndSlash(filePath))
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
      fileNode = await this.getFileNode(null, file)
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
   * Cloud Storageから指定されたディレクトリと配下のノードをマップ形式取得します。
   * @param basePath
   * @param dirPath
   */
  protected async getDirDescendantMap(basePath: string | null, dirPath: string): Promise<{ [path: string]: GCSStorageNode }> {
    basePath = removeBothEndsSlash(basePath)
    dirPath = removeBothEndsSlash(dirPath)

    // 引数ディレクトリと配下ノードを取得
    const dirNode = await this.getDirNode(basePath, dirPath)
    const result = await this.getDescendantMap(basePath, dirPath)

    // 引数ディレクトリと配下ノードが存在しない場合
    if (!dirNode.exists && Object.keys(result).length === 0) {
      return {}
    }

    // 引数ディレクトリは存在しないが、配下ノードは存在する場合
    // ※Cloud Storageに手動でファイルがアップロードされた場合がこの状況にあたる
    if (!dirNode.exists) {
      // 引数ディレクトリを作成
      Object.assign(dirNode, await this.saveDirNode(basePath, dirNode))
    }

    // 引数ディレクトリにIDが振られていない場合、IDを採番
    // ※Cloud Storageに手動でディレクトリが作成された場合がこの状況にあたる
    if (!dirNode.id) {
      Object.assign(dirNode, await this.assignIdToNode(basePath, dirNode))
    }

    // 戻り値に引数ディレクトリを設定
    result[dirNode.path] = dirNode

    return result
  }

  /**
   * Cloud Storageから指定されたディレクトリ配下のノードをマップ形式取得します。
   * @param basePath
   * @param dirPath
   */
  protected async getDescendantMap(basePath: string | null, dirPath?: string): Promise<{ [path: string]: GCSStorageNode }> {
    basePath = removeBothEndsSlash(basePath)
    dirPath = removeBothEndsSlash(dirPath)

    // 引数のディレクトリパスをCloud Storageのパスへ変換
    let gcsDirPath = ''
    if (basePath || dirPath) {
      gcsDirPath = path.join(basePath, dirPath, '/')
    }

    // Cloud Storageから指定されたディレクトリのノードを取得
    const bucket = admin.storage().bucket()
    const [gcsNodes] = await bucket.getFiles({ prefix: gcsDirPath })

    const result: { [path: string]: GCSStorageNode } = {}

    for (const gcsNode of gcsNodes) {
      // basePathが指定されかつ、basePathと取得ノードが一致した場合、無視する
      if (basePath && `${basePath}/` === gcsNode.name) {
        continue
      }
      // 引数ディレクトリは戻り値に含まないので無視
      if (gcsDirPath === gcsNode.name) {
        continue
      }

      const node = this.toStorageNode(basePath, gcsNode)
      node.exists = true

      // ノードにIDが振られていない場合、IDを採番
      // ※Cloud Storageに手動でディレクトリ作成またはアップロードされた場合がこの状況にあたる
      if (!node.id) {
        Object.assign(node, await this.assignIdToNode(basePath, node))
      }

      result[node.path] = node
    }

    // 配下ディレクトリの穴埋め
    Object.assign(result, await this.padRealDirNodes(basePath, result, dirPath))

    return result
  }

  /**
   * Cloud Storageから指定されたディレクトリと直下のノードをマップ形式取得します。
   * @param basePath
   * @param dirPath
   */
  protected async getDirChildMap(basePath: string | null, dirPath: string): Promise<{ [path: string]: GCSStorageNode }> {
    basePath = removeBothEndsSlash(basePath)
    dirPath = removeBothEndsSlash(dirPath)

    // 引数ディレクトリと配下ノードを取得
    const dirNode = await this.getDirNode(basePath, dirPath)
    const result = await this.getChildMap(basePath, dirPath)

    // 引数ディレクトリと配下ノードが存在しない場合
    if (!dirNode.exists && Object.keys(result).length === 0) {
      return {}
    }

    // 引数ディレクトリは存在しないが、配下ノードは存在する場合
    // ※Cloud Storageに手動でファイルがアップロードされた場合がこの状況にあたる
    if (!dirNode.exists) {
      // 引数ディレクトリを作成
      Object.assign(dirNode, await this.saveDirNode(basePath, dirNode))
    }

    // 引数ディレクトリにIDが振られていない場合、IDを採番
    // ※Cloud Storageに手動でディレクトリが作成された場合がこの状況にあたる
    if (!dirNode.id) {
      Object.assign(dirNode, await this.assignIdToNode(basePath, dirNode))
    }

    // 戻り値に引数ディレクトリを設定
    result[dirNode.path] = dirNode

    return result
  }

  /**
   * Cloud Storageから指定されたディレクトリ直下のノードをマップ形式取得します。
   * @param basePath
   * @param dirPath
   */
  protected async getChildMap(basePath: string | null, dirPath?: string): Promise<{ [path: string]: GCSStorageNode }> {
    basePath = removeBothEndsSlash(basePath)
    dirPath = removeBothEndsSlash(dirPath)

    // 引数ディレクトリパスをCloud Storageのパスへ変換
    let gcsDirPath = ''
    if (basePath || dirPath) {
      gcsDirPath = path.join(basePath, dirPath, '/')
    }

    // Cloud Storageから指定されたディレクトリのノードを取得
    const bucket = admin.storage().bucket()
    const [gcsNodes, _, apiResponse] = await bucket.getFiles({
      prefix: gcsDirPath,
      autoPaginate: false,
      delimiter: '/',
    })

    const result: { [path: string]: GCSStorageNode } = {}

    // 指定されたディレクトリと直下のファイルを処理
    // ※ここでは直下のディレクトリは処理されない
    for (const gcsNode of gcsNodes) {
      // basePathが指定されかつ、basePathと取得ノードが一致した場合、無視する
      if (basePath && `${basePath}/` === gcsNode.name) {
        continue
      }
      // 引数ディレクトリは戻り値に含めないため無視
      if (gcsDirPath === gcsNode.name) {
        continue
      }

      const node = this.toStorageNode(basePath, gcsNode) as GCSStorageNode
      node.exists = true

      // ファイルにIDが振られていない場合は設定
      // ※Cloud Storageに手動でアップロードされた場合がこの状況にあたる
      if (!node.id) {
        Object.assign(node, await this.assignIdToNode(basePath, node))
      }

      result[node.path] = node
    }

    // 直下のディレクトリを処理
    const prefixes: string[] = apiResponse.prefixes || []
    await Promise.all(
      prefixes.map(async dirPath => {
        // basePathが指定された場合、basePathを取り除く
        if (basePath) {
          dirPath = dirPath.replace(path.join(basePath, '/'), '')
        }
        const dirNode = await this.getDirNode(basePath, dirPath)

        // ディレクトリが存在しない場合、ディレクトリを作成
        // ※Cloud Storageに手動でアップロードされた場合がこの状況にあたる
        if (!dirNode.exists) {
          Object.assign(dirNode, await this.saveDirNode(basePath, dirNode))
        }

        // ディレクトリにIDが振られていない場合は設定
        // ※Cloud Storageに手動でディレクトリが作成された場合がこの状況にあたる
        if (!dirNode.id) {
          Object.assign(dirNode, await this.assignIdToNode(basePath, dirNode))
        }

        result[dirNode.path] = dirNode
      })
    )

    return result
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
   * `topPath`は最上位のパスで、このパス含め上位のディレクトリは作成しません。
   * 例えば、'aaa/bbb/ccc/family.png'というノードがあり、ディレクトリが存在しないとします。
   * この条件で`topPath`に'aaa/bbb'を指定すると次のようなディレクトリノードが作成されます。
   * + 'aaa' ← 最上位パスより上なので作成されない
   * + 'aaa/bbb' ← 最上位パスなので作成されない
   * + 'aaa/bbb/ccc' ← 作成される
   *
   * @param basePath
   * @param nodeMap
   * @param topPath
   */
  protected async padVirtualDirNodes(
    basePath: string | null,
    nodeMap: { [path: string]: GCSStorageNode },
    topPath: string | null
  ): Promise<{ [path: string]: GCSStorageNode }> {
    basePath = removeBothEndsSlash(basePath)
    topPath = removeBothEndsSlash(topPath)

    // 指定された全ノードの階層的なディレクトリパスを取得
    const dirPaths = Object.values(nodeMap).map(node => node.dir)
    const hierarchicalDirPaths = splitHierarchicalPaths(...dirPaths, topPath || '')

    // 欠けているディレクトリパスを取得
    const lackDirPaths: string[] = []
    for (const dirPath of hierarchicalDirPaths) {
      // 引数で最上位パスが指定されている場合
      if (topPath) {
        // 最上位パスとループパスが同じ場合、スルー
        if (topPath === dirPath) continue
        // ループパスが最上位パスより上位の場合、スルー
        // ※ ｢dirPath: 'd1', topPath: 'd1/d11'｣ の場合、dirPathはtopPathより上位のノードとなる
        if (!dirPath.startsWith(topPath)) continue
      }

      // ループパスのノードが既に存在する場合はスルー
      if (nodeMap[dirPath]) {
        continue
      }
      lackDirPaths.push(dirPath)
    }

    const result: { [path: string]: GCSStorageNode } = {}

    const promises: Promise<void>[] = []
    for (const lackDirPath of lackDirPaths) {
      const promise = (async () => {
        const dirNode = await this.getDirNode(basePath, lackDirPath)
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
   * @param nodeMap
   * @param topPath
   */
  protected async padRealDirNodes(
    basePath: string | null,
    nodeMap: { [path: string]: GCSStorageNode },
    topPath: string | null
  ): Promise<{ [path: string]: GCSStorageNode }> {
    const paddedNodeMap = await this.padVirtualDirNodes(basePath, nodeMap, topPath)
    const result = Object.assign({}, nodeMap, paddedNodeMap)
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
   * 指定されたノード一覧の階層構造に必要なノードを取得し、
   * 指定ノードと取得ノードへのアクセスを容易にするためのストアクラスを返します。
   * @param basePath
   * @param nodes
   */
  protected async getHierarchicalNodeStore(basePath: string | null, nodes: GCSStorageNode[]) {
    // 引数のノード一覧をマップ化
    const hierarchicalNodeMap = nodes.reduce((result, node) => {
      result[node.path] = node
      return result
    }, {} as { [path: string]: GCSStorageNode })

    // 引数ノードの階層構造に必要なノードを取得
    {
      const dirPaths = Object.keys(hierarchicalNodeMap)
      const hierarchicalDirPaths = splitHierarchicalPaths(...dirPaths)
      const promises: Promise<void>[] = []
      for (const dirPath of hierarchicalDirPaths) {
        if (hierarchicalNodeMap[dirPath]) continue
        promises.push(
          (async () => {
            hierarchicalNodeMap[dirPath] = await this.getDirNode(basePath, dirPath)
          })()
        )
      }
      await Promise.all(promises)
    }

    // 引数ノードの階層構造にアクセスするためのストアクラスを作成
    const result = new (class {
      constructor(private m_nodeMap: { [path: string]: GCSStorageNode }) {}

      get nodes(): GCSStorageNode[] {
        return Object.values(this.m_nodeMap)
      }

      getNode(dirPath: string): GCSStorageNode | undefined {
        return this.m_nodeMap[dirPath]
      }

      getNearestShareSettings(nodePath: string): StorageNodeShareSettings | undefined {
        const node = this.m_nodeMap[nodePath]
        if (!node) {
          return
        }

        const parentDirNode = this.m_nodeMap[node.dir]
        if (!parentDirNode) return

        if (parentDirNode.exists) {
          return parentDirNode.share
        } else {
          return this.getNearestShareSettings(parentDirNode.path)
        }
      }
    })(hierarchicalNodeMap)

    return result
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
   * targetからfromParentの設定を除去し、その後targetへtoParentの設定をマージします。
   * @param target
   * @param fromParent
   * @param toParent
   */
  private m_mergeShareSettings(target: StorageNodeShareSettings, fromParent: StorageNodeShareSettings, toParent: StorageNodeShareSettings): void {
    // targetの公開フラグを設定する
    // 例1: target.isPublic === fromParent.isPublic の場合、
    //      targetはfromParentの設定を受け継いでおりfromParentの設定を尊重しているが、
    //      今回は親がtoParentに代わるためtoParentの公開フラグを設定する。
    // 例2: targetとfromParentの公開フラグが異なる場合、
    //      targetはfromParentの設定を受け継いでおらず、targetにはあえて公開フラグの
    //      設定がされているので、条件文は実行せず公開フラグは現状を維持する。
    if (target.isPublic === fromParent.isPublic) {
      target.isPublic = toParent.isPublic
    }

    // 親がfromParentからtoParentへ代わるので、targetからfromParentのユーザーIDは除去する
    // ※targetにあえて設定されたユーザーIDは維持される
    for (let i = 0; i < target.uids.length; i++) {
      const targetUID = target.uids[i]
      if (fromParent.uids.includes(targetUID)) {
        target.uids.splice(i--, 1)
      }
    }

    // targetのユーザーIDにtoParentのユーザーIDをマージ
    for (const toParentUID of toParent.uids) {
      if (!target.uids.includes(toParentUID)) {
        target.uids.push(toParentUID)
      }
    }
  }

  /**
   * 共有設定をJSON文字列へ変換します。
   * @param settings
   */
  private m_toShareSettingsString(settings: StorageNodeShareSettings): string | null {
    if (!settings.isPublic && settings.uids.length === 0) {
      return null
    } else {
      return JSON.stringify(settings)
    }
  }

  /**
   * 指定されたGCSノードのメタデータから共有設定を抽出します。
   * @param gcsNode
   */
  private m_extractShareSettings(gcsNode: File): StorageNodeShareSettings {
    let result: StorageNodeShareSettings = { isPublic: false, uids: [] }

    if (gcsNode.metadata.metadata && gcsNode.metadata.metadata.share) {
      try {
        result = JSON.parse(gcsNode.metadata.metadata.share)
      } catch (err) {
        // TODO どのようにログ出力するか検討が必要!!!
      }
    }

    return result
  }
}
