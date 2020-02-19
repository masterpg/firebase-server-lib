//
// Google Cloud Storage: Node.js Client
// https://googleapis.dev/nodejs/storage/latest/index.html
//

import * as admin from 'firebase-admin'
import * as path from 'path'
import * as shortid from 'shortid'
import { AuthServiceDI, IdToken } from '../nest'
import { Inject, UnauthorizedException } from '@nestjs/common'
import { InputValidationError, config } from '../base'
import { Request, Response } from 'express'
import { removeBothEndsSlash, removeEndSlash, removeStartSlash, splitFilePath } from 'web-base-lib'
import { Dayjs } from 'dayjs'
import { File } from '@google-cloud/storage'
import { UserRecord } from 'firebase-functions/lib/providers/auth'
const dayjs = require('dayjs')
const cloneDeep = require('lodash/cloneDeep')

export type StorageUser = Pick<IdToken, 'uid' | 'myDirName'> | Pick<UserRecord, 'uid' | 'customClaims'>

export enum StorageNodeType {
  File = 'File',
  Dir = 'Dir',
}

export interface StorageNode {
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

export interface StorageNodeShareSettings {
  isPublic: boolean
  uids: string[]
}

export type StorageNodeShareSettingsInput = Partial<StorageNodeShareSettings>

export class SignedUploadUrlInput {
  filePath!: string
  contentType?: string
}

export interface GCSStorageNode extends StorageNode {
  exists: boolean
  gcsNode: File
}

export interface UploadDataItem {
  data: string | Buffer
  path: string
  contentType: string
}

export class LibStorageService {
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
   *
   * 戻り値は基準パスのノードが除去され、次のようなノードが返されます。
   *   + 'photos'
   *   + 'photos/family.png'
   *   + 'photos/children.png'
   *
   * @param dirPath
   * @param basePath
   */
  async getDirAndDescendants(dirPath?: string, basePath?: string): Promise<GCSStorageNode[]> {
    // Cloud Storageから指定されたディレクトリのノードを取得
    const nodeMap = await this.getDirAndDescendantMap(dirPath, basePath)

    // 親ディレクトリの穴埋め
    await this.padVirtualDirNode(nodeMap, null, basePath)

    // ディレクトリ階層を表現できるようノード配列をソート
    const result = Object.values(nodeMap)
    this.sortStorageNodes(result)

    return result
  }

  /**
   * Cloud Storageのユーザーディレクトリから指定されたディレクトリと配下のノードを取得します。
   * @param user
   * @param dirPath
   */
  async getUserDirAndDescendants(user: StorageUser, dirPath?: string): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.getDirAndDescendants(dirPath, userDirPath)
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
   * @param dirPaths
   * @param basePath
   */
  async createDirs(dirPaths: string[], basePath?: string): Promise<GCSStorageNode[]> {
    basePath = removeBothEndsSlash(basePath)

    // 指定されたパスのバリデーションチェック
    dirPaths.forEach(dirPath => this.validatePath(dirPath))

    // 引数ディレクトリのノードを取得
    // ※存在する、しないディレクトリが混在する
    const dirNodes = await Promise.all(dirPaths.map(dirPath => this.getDirNode(dirPath, basePath)))

    // 上記で取得したディレクトリノードの階層構造に必要なノードを取得/格納したストアを取得
    const hierarchicalNodeStore = await this.getHierarchicalNodeStore(dirNodes, basePath)

    // ディレクトリを作成
    const result: GCSStorageNode[] = []
    await Promise.all(
      hierarchicalNodeStore.nodes.map(async dirNode => {
        // ディレクトリが存在する場合はディレクトリを作成せず終了
        if (dirNode.exists) return
        // ディレクトリを作成
        await dirNode.gcsNode.save('')
        // 直近の祖先ディレクトリの共有設定を取得
        const shareSettings = hierarchicalNodeStore.getNearestShareSettings(dirNode.path)
        // 共有設定を作成したディレクトリに設定
        if (shareSettings) {
          await this.m_saveShareSettings(dirNode.gcsNode, shareSettings)
        }

        result.push(this.toStorageNode(dirNode.gcsNode, basePath))
      })
    )

    return this.sortStorageNodes(result)
  }

  /**
   * Cloud Storageのユーザーディレクトリ配下にディレクトリを作成します。
   * @param user
   * @param dirPaths
   */
  async createUserDirs(user: StorageUser, dirPaths: string[]): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.createDirs(dirPaths, userDirPath)
  }

  /**
   * Cloud Storageへのファイルアップロードの後に必要な処理を行います。
   * @param filePaths
   * @param basePath
   */
  async handleUploadedFiles(filePaths: string[], basePath?: string): Promise<GCSStorageNode[]> {
    basePath = removeBothEndsSlash(basePath)

    // 指定されたパスのバリデーションチェック
    filePaths.forEach(filePath => this.validatePath(filePath))

    // 引数ファイルのノードを取得
    // const fileNodes = await Promise.all(filePaths.map(filePath => this.getFileNode(filePath, basePath)))
    const fileNodes = await Promise.all(
      filePaths.map(async filePath => {
        const fileNode = await this.getFileNode(filePath, basePath)
        if (!fileNode.exists) {
          throw new Error(`Uploaded file not found: '${path.join(basePath!, filePath)}'`)
        }
        return fileNode
      })
    )

    // 上記で取得したファイルノードの階層構造に必要なノードを取得/格納したストアを取得
    const hierarchicalNodeStore = await this.getHierarchicalNodeStore(fileNodes, basePath)

    // ディレクトリ作成と共有設定の継承
    const result: GCSStorageNode[] = []
    await Promise.all(
      hierarchicalNodeStore.nodes.map(async node => {
        //ループノードがディレクトリの場合
        if (node.nodeType === StorageNodeType.Dir) {
          // ループディレクトリが存在する場合は何もせず終了
          if (node.exists) return
          // ループディレクトリが実際にはCloud Storageに存在しない場合、ディレクトリを作成
          await node.gcsNode.save('')
        }
        // 直近の祖先ディレクトリの共有設定を取得
        const shareSettings = hierarchicalNodeStore.getNearestShareSettings(node.path)
        // 共有設定をループノードに設定
        if (shareSettings) {
          await this.m_saveShareSettings(node.gcsNode, shareSettings)
        }

        result.push(this.toStorageNode(node.gcsNode, basePath))
      })
    )

    return this.sortStorageNodes(result)
  }

  /**
   * Cloud Storageへのユーザーファイルアップロードの後に必要な処理を行います。
   * @param user
   * @param filePaths
   */
  async handleUploadedUserFiles(user: StorageUser, filePaths: string[]): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.handleUploadedFiles(filePaths, userDirPath)
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
   * @param dirPaths
   * @param basePath
   */
  async removeDirs(dirPaths: string[], basePath?: string): Promise<GCSStorageNode[]> {
    const remove = async (dirPath: string, basePath?: string) => {
      dirPath = removeBothEndsSlash(dirPath)
      if (!dirPath) return Promise.resolve([])

      // Cloud Storageから指定されたディレクトリのノードを取得
      const nodeMap = await this.getDirAndDescendantMap(dirPath, basePath)
      // 親ディレクトリの穴埋め
      await this.padVirtualDirNode(nodeMap, dirPath, basePath)

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
      const nodes = await remove(dirPath, basePath)
      result.push(...nodes)
    }

    this.sortStorageNodes(result)

    return result
  }

  /**
   * Cloud Storageのユーザーディレクトリ配下にあるファイルを削除します。。
   * @param user
   * @param dirPaths
   */
  async removeUserDirs(user: StorageUser, dirPaths: string[]): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.removeDirs(dirPaths, userDirPath)
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
   * @param filePaths
   * @param basePath
   */
  async removeFiles(filePaths: string[], basePath?: string): Promise<GCSStorageNode[]> {
    basePath = removeBothEndsSlash(basePath)

    const bucket = admin.storage().bucket()
    const nodeMap: { [path: string]: GCSStorageNode } = {}

    const promises: Promise<void>[] = []
    for (let filePath of filePaths) {
      filePath = removeBothEndsSlash(filePath)
      if (!filePath) continue

      promises.push(
        (async () => {
          const gcsFilePath = removeBothEndsSlash(path.join(basePath, filePath))
          const gcsFileNode = bucket.file(gcsFilePath)
          const exists = (await gcsFileNode.exists())[0]
          if (exists) {
            await gcsFileNode.delete()
            const node = this.toStorageNode(gcsFileNode, basePath)
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
   * Cloud Storageのユーザーディレクトリ配下にあるファイルを削除します。。
   * @param user
   * @param filePaths
   */
  async removeUserFiles(user: StorageUser, filePaths: string[]): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.removeFiles(filePaths, userDirPath)
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
   * @param fromDirPath
   * @param toDirPath
   * @param basePath
   */
  async moveDir(fromDirPath: string, toDirPath: string, basePath?: string): Promise<GCSStorageNode[]> {
    fromDirPath = removeBothEndsSlash(fromDirPath)
    toDirPath = removeBothEndsSlash(toDirPath)
    basePath = removeBothEndsSlash(basePath)

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

    // 移動元ディレクトリ配下のノードを取得
    // ※この段階ではfromDirPathのノードも含む
    const movingDescendantMap = await this.getDirAndDescendantMap(fromDirPath, basePath)
    const dirNode = movingDescendantMap[fromDirPath]
    if (!dirNode || !dirNode.exists) {
      throw new Error(`The source directory does not exist: '${path.join(basePath, fromDirPath)}'`)
    }

    // 移動先ディレクトリの存在確認
    // (アプリケーションまたはユーザーディレクトリ直下へ移動する場合は確認しない)
    let toDirParentNode: GCSStorageNode | undefined
    if (path.dirname(toDirPath) !== '.') {
      const toDirParentPath = path.join(path.dirname(toDirPath), '/')
      toDirParentNode = await this.getDirNode(toDirParentPath, basePath)
      if (!toDirParentNode.exists) {
        throw new Error(`The destination directory does not exist: '${path.join(basePath, toDirParentNode.path)}'`)
      }
    }

    // 親ディレクトリの穴埋め
    const paddedDirNodes = await this.padVirtualDirNode(movingDescendantMap, fromDirPath, basePath)
    await Promise.all(
      paddedDirNodes.map(async node => {
        if (!node.exists) {
          await node.gcsNode.save('')
        }
      })
    )
    // 移動元ディレクトリと配下のノードは別処理を行うので、movingDescendantMapからは移動元ディレクトリを削除
    delete movingDescendantMap[fromDirPath]

    // 古い親ディレクトリの共有設定を移動元ディレクトリ＋配下のノードから削除
    await this.setDirShareSettings(fromDirPath, null, basePath)
    // 新しい親ディレクトリの共有設定を移動元ディレクトリ＋配下のノードに設定
    if (toDirParentNode) {
      await this.setDirShareSettings(fromDirPath, toDirParentNode.share, basePath)
    }

    const resultMap: { [path: string]: GCSStorageNode } = {}

    // 移動元ディレクトリの移動処理
    {
      const newDirNodePath = path.join(toDirPath, '/')
      await dirNode.gcsNode!.move(path.join(basePath, newDirNodePath))
      const newDirNode = (await this.getDirNode(newDirNodePath, basePath))!
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
            await node.gcsNode!.move(path.join(basePath, newNodePath, '/'))
            const movedNode = (await this.getDirNode(newNodePath, basePath))!
            resultMap[movedNode.path] = movedNode
          }
          // ノードがファイルの場合
          else {
            await node.gcsNode!.move(path.join(basePath, newNodePath))
            const movedNode = await this.getFileNode(newNodePath, basePath)
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
   * Cloud Storageのユーザーディレクトリを指定されたディレクトリへ移動します。
   * 移動元ディレクトリまたは移動先ディレクトリがない場合は移動は行われず、空配列が返されます。
   * @param user
   * @param fromDirPath
   * @param toDirPath
   */
  async moveUserDir(user: StorageUser, fromDirPath: string, toDirPath: string): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.moveDir(fromDirPath, toDirPath, userDirPath)
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
   * @param fromFilePath
   * @param toFilePath
   * @param basePath
   */
  async moveFile(fromFilePath: string, toFilePath: string, basePath?: string): Promise<GCSStorageNode> {
    fromFilePath = removeBothEndsSlash(fromFilePath)
    toFilePath = removeBothEndsSlash(toFilePath)
    basePath = removeBothEndsSlash(basePath)

    this.validatePath(toFilePath)

    // 移動元ファイルの存在確認
    const fileNode = await this.getFileNode(fromFilePath, basePath)
    if (!fileNode.exists) {
      throw new Error(`The source file does not exist: '${path.join(basePath, fileNode.path)}'`)
    }

    // 移動先ディレクトリの存在確認
    const toDirPath = path.join(path.dirname(toFilePath))
    const toDirNode = await this.getDirNode(toDirPath, basePath)
    if (!toDirNode.exists) {
      throw new Error(`The destination directory does not exist: '${path.join(basePath, toDirNode.path)}'`)
    }

    // 移動元ディレクトリの取得
    const fromDirNode = await this.getDirNode(fileNode.dir, basePath)

    // ファイルの移動
    await fileNode.gcsNode!.move(path.join(basePath, toFilePath))

    // 移動先ディレクトリの共有設定を継承
    this.m_mergeShareSettings(fileNode.share, fromDirNode.share, toDirNode.share)
    const result = await this.setFileShareSettings(toFilePath, fileNode.share, basePath)

    return result
  }

  /**
   * Cloud Storageのユーザーディレクトリ配下にあるファイルを指定されたディレクトリへ移動します。
   * 移動元ファイルまたは移動先ディレクトリがない場合、移動は行われず、戻り値は何も返しません。
   * @param user
   * @param fromFilePath
   * @param toDirPath
   */
  async moveUserFile(user: StorageUser, fromFilePath: string, toDirPath: string): Promise<GCSStorageNode> {
    const userDirPath = this.getUserDirPath(user)
    return this.moveFile(fromFilePath, toDirPath, userDirPath)
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
   * @param dirPath
   * @param newName
   * @param basePath
   */
  async renameDir(dirPath: string, newName: string, basePath?: string): Promise<GCSStorageNode[]> {
    dirPath = removeBothEndsSlash(dirPath)

    this.validateDirName(newName)

    // リネームした際のパスを作成
    const reg = new RegExp(`${path.basename(dirPath)}$`)
    const toDirPath = dirPath.replace(reg, newName)

    // 既に同じ名前のディレクトリがある場合
    const toDirNode = await this.getDirNode(toDirPath)
    if (toDirNode.exists) {
      throw new Error(`The specified directory name already exists: '${dirPath}' -> '${toDirPath}'`)
    }

    return this.moveDir(dirPath, toDirPath, basePath)
  }

  /**
   * Cloud Storageのユーザーディレクトリ配下にあるディレクトリのリネームを行います。
   * リネームするディレクトリがない場合、リネームは行われず、空配列が返されます。
   * @param user
   * @param dirPath
   * @param newName
   */
  async renameUserDir(user: StorageUser, dirPath: string, newName: string): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.renameDir(dirPath, newName, userDirPath)
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
   * @param filePath
   * @param newName
   * @param basePath
   */
  async renameFile(filePath: string, newName: string, basePath?: string): Promise<GCSStorageNode> {
    filePath = removeBothEndsSlash(filePath)

    this.validateFileName(newName)

    // リネームした際のパスを作成
    const reg = new RegExp(`${path.basename(filePath)}$`)
    const toFilePath = filePath.replace(reg, newName)

    // 既に同じ名前のファイルがある場合
    const toFileNode = await this.getFileNode(toFilePath)
    if (toFileNode.exists) {
      throw new Error(`The specified file name already exists: '${filePath}' -> '${toFilePath}'`)
    }

    return this.moveFile(filePath, toFilePath, basePath)
  }

  /**
   * Cloud Storageのユーザーディレクトリ配下にあるファイルのリネームを行います。
   * リネームするファイルがない場合、リネームは行われず、戻り値は何も返しません。
   * @param user
   * @param filePath
   * @param newName
   */
  async renameUserFile(user: StorageUser, filePath: string, newName: string): Promise<GCSStorageNode> {
    const userDirPath = this.getUserDirPath(user)
    return this.renameFile(filePath, newName, userDirPath)
  }

  /**
   * Cloud Storageのディレクトリに対して共有設定を行います。
   * @param dirPath
   * @param settings
   * @param basePath
   */
  async setDirShareSettings(dirPath: string, settings: StorageNodeShareSettingsInput | null, basePath?: string): Promise<GCSStorageNode[]> {
    dirPath = removeBothEndsSlash(dirPath)
    basePath = removeBothEndsSlash(basePath)

    // 指定されたディレクトリのノード一覧を取得
    const descendantMap = await this.getDirAndDescendantMap(dirPath, basePath)
    if (Object.values(descendantMap).length === 0) {
      return []
    }
    // 親ディレクトリの穴埋め
    await this.padVirtualDirNode(descendantMap, dirPath, basePath)
    // 引数ディレクトリがCloud Storageにディレクトリが存在しない場合は作成
    const dirNode = descendantMap[dirPath]
    if (!dirNode.exists) {
      await dirNode.gcsNode.save('')
    }
    // 引数ディレクトリと配下のノードは別処理を行うので、descendantMapから引数ディレクトリを削除
    delete descendantMap[dirPath]

    const result: GCSStorageNode[] = []

    // 引数ディレクトリの共有設定
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
    await this.m_saveShareSettings(dirNode.gcsNode, newDirSettings)
    result.push(this.toStorageNode(dirNode.gcsNode, basePath))

    // 引数ディレクトリの配下ノードの共有設定
    const promises: Promise<void>[] = []
    for (const descendantNode of Object.values(descendantMap)) {
      const promise = (async () => {
        // Cloud Storageにディレクトリが存在しない場合は作成
        if (descendantNode.nodeType === StorageNodeType.Dir && !descendantNode.exists) {
          await descendantNode.gcsNode.save('')
        }

        const newSettings = cloneDeep(descendantNode.share)
        // ループノードの共有設定と前回/今回の親ディレクトリの共有設定をマージする
        this.m_mergeShareSettings(newSettings, oldDirSettings, newDirSettings)
        // 現ノードの共有設定を保存
        await this.m_saveShareSettings(descendantNode.gcsNode, newSettings)

        result.push(this.toStorageNode(descendantNode.gcsNode, basePath))
      })()
      promises.push(promise)
    }
    await Promise.all(promises)

    return this.sortStorageNodes(result)
  }

  /**
   * Cloud Storageのユーザーディレクトリに対して共有設定を行います。
   * @param user
   * @param dirPath
   * @param settings
   * @param basePath
   */
  async setUserDirShareSettings(
    user: StorageUser,
    dirPath: string,
    settings: StorageNodeShareSettingsInput,
    basePath?: string
  ): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.setDirShareSettings(dirPath, settings, userDirPath)
  }

  /**
   * Cloud Storageのファイルに対してい共有設定を行います。
   * @param filePath
   * @param settings
   * @param basePath
   */
  async setFileShareSettings(filePath: string, settings: StorageNodeShareSettingsInput | null, basePath?: string): Promise<GCSStorageNode> {
    filePath = removeBothEndsSlash(filePath)
    basePath = removeBothEndsSlash(basePath)

    const node = await this.getFileNode(filePath, basePath)
    if (!node.exists) {
      throw new Error(`The specified file does not exist: '${path.join(basePath, filePath)}'`)
    }

    const newDirSettings: StorageNodeShareSettings = { isPublic: false, uids: [] }
    if (settings && typeof settings.isPublic === 'boolean') {
      newDirSettings.isPublic = settings.isPublic
    }
    if (settings && settings.uids) {
      newDirSettings.uids = settings.uids
    }

    await this.m_saveShareSettings(node.gcsNode, newDirSettings)

    return this.toStorageNode(node.gcsNode, basePath)
  }

  /**
   * Cloud Storageのユーザーディレクトリに対して共有設定を行います。
   * @param user
   * @param filePath
   * @param settings
   * @param basePath
   */
  async setUserFileShareSettings(
    user: StorageUser,
    filePath: string,
    settings: StorageNodeShareSettingsInput,
    basePath?: string
  ): Promise<GCSStorageNode> {
    const userDirPath = this.getUserDirPath(user)
    return this.setFileShareSettings(filePath, settings, userDirPath)
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
      const { fileName, dirPath } = splitFilePath(filePath)
      const gcsFilePath = path.join(dirPath, fileName)
      const gcsFileNode = bucket.file(gcsFilePath)

      urlMap[filePath] = (
        await gcsFileNode.createResumableUpload({
          origin: requestOrigin,
          metadata: { contentType },
        })
      )[0]
    }

    return inputs.map(input => urlMap[input.filePath])
  }

  /**
   * Cloud Storageからノードを取得します。
   * @param nodePath
   *   ファイルまたはディレクトリのパスを指定します。
   *   ディレクトリパスを指定する場合は末尾に'/'を付与するよう注意してください。
   * @param basePath
   */
  async getNode(nodePath: string, basePath?: string): Promise<GCSStorageNode> {
    nodePath = removeStartSlash(nodePath)
    basePath = removeBothEndsSlash(basePath)

    const bucket = admin.storage().bucket()
    const gcsNodePath = path.join(basePath, nodePath)
    const gcsNode = bucket.file(gcsNodePath)
    const exists = (await gcsNode.exists())[0]

    const node = this.toStorageNode(gcsNode, basePath) as GCSStorageNode
    node.exists = exists
    node.gcsNode = gcsNode
    return node
  }

  /**
   * Cloud Storageからディレクトリノードを取得します。
   * @param dirPath
   * @param basePath
   */
  async getDirNode(dirPath: string, basePath?: string): Promise<GCSStorageNode> {
    return this.getNode(path.join(dirPath, '/'), basePath)
  }

  /**
   * Cloud Storageからファイルノードを取得します。
   * @param filePath
   * @param basePath
   */
  async getFileNode(filePath: string, basePath?: string): Promise<GCSStorageNode> {
    return this.getNode(removeEndSlash(filePath), basePath)
  }

  /**
   * Cloud Storageから指定されたディレクトリと配下のノードをマップ形式取得します。
   * `dirPath`を指定すると、このディレクトリ(※1)を含めた配下のノードを取得します。
   * ※1 Cloud Storageにディレクトリが実際に存在する場合のみ取得されます。
   * @param dirPath
   * @param basePath
   */
  async getDirAndDescendantMap(dirPath?: string, basePath?: string): Promise<{ [path: string]: GCSStorageNode }> {
    basePath = removeBothEndsSlash(basePath)
    dirPath = removeBothEndsSlash(dirPath)

    // 引数のディレクトリパスをCloud Storageのパスへ変換
    let gcsDirPath = ''
    if (dirPath || basePath) {
      gcsDirPath = path.join(basePath, dirPath, '/')
    }

    // Cloud Storageから指定されたディレクトリのノードを取得
    const bucket = admin.storage().bucket()
    const response = await bucket.getFiles({ prefix: gcsDirPath })
    const gcsNodes = response[0] as File[]

    const result: { [path: string]: GCSStorageNode } = {}

    for (const gcsNode of gcsNodes) {
      // basePathが指定されかつ、basePathと取得ノードが一致した場合、無視する
      if (basePath && `${basePath}/` === gcsNode.name) {
        continue
      }
      const node = this.toStorageNode(gcsNode, basePath) as GCSStorageNode
      node.exists = true
      node.gcsNode = gcsNode
      result[node.path] = node
    }

    return result
  }

  /**
   * クライアントから指定されたアプリケーションファイルをレスポンスします。
   * @param req
   * @param res
   * @param filePath
   */
  async serveAppFile(req: Request, res: Response, filePath: string): Promise<Response> {
    const fileNode = await this.getFileNode(filePath)

    // ファイルの公開フラグがオンの場合
    if (fileNode.share.isPublic) {
      return this.serveFile(req, res, fileNode)
    }

    // ユーザー認証されているか検証
    const validated = await this.authService.validate(req, res)
    if (!validated.result) {
      return res.sendStatus(validated.error!.getStatus())
    }

    const user = validated.idToken!

    // 自ユーザーがアプリケーション管理者の場合
    if (user.isAppAdmin) {
      return this.serveFile(req, res, fileNode)
    }

    // ファイルのユーザーIDの共有設定に自ユーザーが含まれている場合
    if (fileNode.share.uids.includes(user.uid)) {
      return this.serveFile(req, res, fileNode)
    }

    return res.sendStatus(403)
  }

  /**
   * クライアントから指定されたユーザーファイルをレスポンスします。
   * @param req
   * @param res
   * @param filePath
   */
  async serveUserFile(req: Request, res: Response, filePath: string): Promise<Response> {
    const fileNode = await this.getFileNode(filePath)

    // ファイルの公開フラグがオンの場合
    if (fileNode.share.isPublic) {
      return this.serveFile(req, res, fileNode)
    }

    // ユーザー認証されているか検証
    const validated = await this.authService.validate(req, res)
    if (!validated.result) {
      return res.sendStatus(validated.error!.getStatus())
    }

    // ユーザーディレクトリ名が割り当てられているか検証
    const user = validated.idToken!
    if (!user.myDirName) {
      res.setHeader('WWW-Authenticate', 'Bearer error="invalid_token')
      throw new UnauthorizedException(`'myDirName' has not been assigned to the user [uid: '${user.uid}].`)
    }

    // 指定ファイルが自ユーザーの所有物である場合
    const userDirPath = this.getUserDirPath(user)
    if (filePath.startsWith(path.join(userDirPath, '/'))) {
      return this.serveFile(req, res, fileNode)
    }

    // ファイルのユーザーIDの共有設定に自ユーザーが含まれている場合
    if (fileNode.share.uids.includes(user.uid)) {
      return this.serveFile(req, res, fileNode)
    }

    return res.sendStatus(403)
  }

  /**
   * Cloud Storageのユーザーディレクトリの名前を割り当てます。
   * @param user
   */
  async assignUserDir(user: StorageUser): Promise<void> {
    let myDirName = this.m_getMyDirNameFromStorageUser(user)
    const uid = user.uid

    // まだユーザーディレクトリ名が割り当てられていない場合
    if (!myDirName) {
      // カスタムクレームに'myDirName'というプロパティを追加。
      // このプロパティの値がユーザーディレクトリ名となる。
      myDirName = shortid.generate()
      await admin.auth().setCustomUserClaims(uid, {
        myDirName,
      })
    }

    // ユーザーディレクトリの作成(存在しない場合のみ)
    const userDirPath = this.getUserDirPath({ uid, myDirName })
    const userDirNode = await this.getDirNode(userDirPath)
    if (!userDirNode.exists) {
      await this.createDirs([userDirNode.path])
    }
  }

  /**
   * Cloud Storageのユーザーディレクトリのパスを取得します。
   * @param user
   */
  getUserDirPath(user: StorageUser): string {
    const myDirName = this.m_getMyDirNameFromStorageUser(user)
    if (myDirName) {
      const usersDir = config.storage.usersDir
      return path.join(usersDir, myDirName)
    }
    throw new Error(`User [uid: '${user.uid}'] does not have a storage directory assigned.`)
  }

  /**
   * ローカルファイルをCloud Storageへアップロードします。
   * @param uploadList
   * @param basePath
   */
  async uploadLocalFiles(uploadList: { localFilePath: string; toFilePath: string }[], basePath?: string): Promise<GCSStorageNode[]> {
    const bucket = admin.storage().bucket()
    basePath = removeBothEndsSlash(basePath)

    const uploadedFileMap: { [path: string]: GCSStorageNode } = {}
    const promises: Promise<void>[] = []
    for (const uploadItem of uploadList) {
      const destination = path.join(basePath, removeBothEndsSlash(uploadItem.toFilePath))
      promises.push(
        bucket.upload(uploadItem.localFilePath, { destination }).then(response => {
          const file = response[0]
          const metadata = response[1]
          const fileNode = this.toStorageNode(file, basePath)
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
   * @param uploadList
   * @param basePath
   */
  async uploadAsFiles(uploadList: UploadDataItem[], basePath?: string): Promise<GCSStorageNode[]> {
    basePath = removeBothEndsSlash(basePath)
    const bucket = admin.storage().bucket()

    const uploadedFileMap: { [path: string]: GCSStorageNode } = {}
    const promises: Promise<void>[] = []
    for (const uploadItem of uploadList) {
      promises.push(
        (async () => {
          const gcsFileNode = bucket.file(path.join(basePath, uploadItem.path))
          await gcsFileNode.save(uploadItem.data, { contentType: uploadItem.contentType })
          const fileNode = this.toStorageNode(gcsFileNode)
          uploadedFileMap[fileNode.path] = this.toStorageNode(gcsFileNode, basePath)
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
   * @param gcsNode
   *   Cloud Storageのノードを指定。
   *   このノードはCloud Storageから取得したものが渡されることを前提としています。
   *   クライアント側でパスから生成したノード渡さないように注意してください。
   * @param basePath 基準パスを指定
   */
  protected toStorageNode(gcsNode: File, basePath?: string): GCSStorageNode {
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

    return {
      nodeType,
      name,
      dir: removeStartSlash(dir),
      path: removeStartSlash(nodePath),
      contentType: gcsNode.metadata.contentType || '',
      size: Number(gcsNode.metadata.size || '0'),
      share: this.m_extractShareSettings(gcsNode),
      created: dayjs(gcsNode.metadata.timeCreated),
      updated: dayjs(gcsNode.metadata.updated),
      exists: true,
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
   * @param nodeMap
   * @param topPath
   * @param basePath
   */
  protected async padVirtualDirNode(
    nodeMap: { [path: string]: GCSStorageNode },
    topPath: string | null,
    basePath?: string
  ): Promise<GCSStorageNode[]> {
    topPath = removeBothEndsSlash(topPath || undefined)
    basePath = removeBothEndsSlash(basePath)

    // 指定された全ノードの階層的なディレクトリパスを取得
    const dirPaths = Object.values(nodeMap).map(node => node.dir)
    const hierarchicalDirPaths = this.splitHierarchicalDirPaths(...dirPaths)

    // 欠けているディレクトリパスを取得
    const lackDirPaths: string[] = []
    for (const dirPath of hierarchicalDirPaths) {
      // 引数で最上位パスが指定されていて、かつループパスが最上位パスより上位の場合はスルー
      if (topPath && !dirPath.startsWith(topPath)) {
        continue
      }
      // ループパスのノードが既に存在する場合はスルー
      if (nodeMap[dirPath]) {
        continue
      }
      lackDirPaths.push(dirPath)
    }

    const result: GCSStorageNode[] = []

    const promises: Promise<void>[] = []
    for (const lackDirPath of lackDirPaths) {
      const promise = (async () => {
        const dirNode = await this.getDirNode(lackDirPath, basePath)
        nodeMap[dirNode.path] = dirNode
        result.push(dirNode)
      })()
      promises.push(promise)
    }
    await Promise.all(promises)

    return this.sortStorageNodes(result)
  }

  /**
   * 指定されたディレクトリパスを階層的に分割します。
   *
   * 例: 'aaa/bbb/ccc'が指定された場合、
   *    ['aaa', 'aaa/bbb', 'aaa/bbb/ccc']を返します。
   *
   * @param dirPaths
   */
  protected splitHierarchicalDirPaths(...dirPaths: string[]): string[] {
    const set: Set<string> = new Set<string>()

    for (const dirPath of dirPaths) {
      const dirPathSegments = dirPath.split('/').filter(item => !!item)
      for (let i = 0; i < dirPathSegments.length; i++) {
        const currentDirPath = dirPathSegments.slice(0, i + 1).join('/')
        set.add(currentDirPath)
      }
    }

    // ディレクトリ階層順にソート
    return Array.from(set).sort((a, b) => {
      if (a < b) {
        return -1
      } else if (a > b) {
        return 1
      } else {
        return 0
      }
    })
  }

  /**
   * 指定されたノード一覧の階層構造に必要なノードを取得し、
   * 指定ノードと取得ノードへのアクセスを容易にするためのストアクラスを返します。
   * @param nodes
   * @param basePath
   */
  protected async getHierarchicalNodeStore(nodes: GCSStorageNode[], basePath?: string) {
    // 引数のノード一覧をマップ化
    const hierarchicalNodeMap = nodes.reduce((result, node) => {
      result[node.path] = node
      return result
    }, {} as { [path: string]: GCSStorageNode })

    // 引数ノードの階層構造に必要なノードを取得
    {
      const dirPaths = Object.keys(hierarchicalNodeMap)
      const hierarchicalDirPaths = this.splitHierarchicalDirPaths(...dirPaths)
      const promises: Promise<void>[] = []
      for (const dirPath of hierarchicalDirPaths) {
        if (hierarchicalNodeMap[dirPath]) continue
        promises.push(
          (async () => {
            hierarchicalNodeMap[dirPath] = await this.getDirNode(dirPath, basePath)
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

  /**
   * ユーザーディレクトリの名前である`myDirName`の値を取得します。
   * @param user
   */
  private m_getMyDirNameFromStorageUser(user: StorageUser): string | undefined {
    // IdTokeから取得
    if ((user as IdToken).myDirName) {
      return (user as IdToken).myDirName!
    }
    // UserRecordから取得
    else if ((user as UserRecord).customClaims) {
      const customClaims = (user as UserRecord).customClaims!
      return (customClaims as any).myDirName
    }
    return undefined
  }

  //--------------------------------------------------
  //  ファイルサーブ
  //--------------------------------------------------

  /**
   * クライアントから指定されたファイルをサーブします。
   * @param req
   * @param res
   * @param fileNode
   */
  protected async serveFile(req: Request, res: Response, fileNode: GCSStorageNode): Promise<Response> {
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
   * 指定されたGCSノードのメタデータに共有設定を保存します。
   * @param gcsNode
   * @param settings
   */
  private async m_saveShareSettings(gcsNode: File, settings: StorageNodeShareSettings): Promise<void> {
    if (!settings.isPublic && settings.uids.length === 0) {
      await gcsNode.setMetadata({
        metadata: { share: null },
      })
    } else {
      await gcsNode.setMetadata({
        metadata: { share: JSON.stringify(settings) },
      })
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

export namespace LibStorageServiceDI {
  export const symbol = Symbol(LibStorageService.name)
  export const provider = {
    provide: symbol,
    useClass: LibStorageService,
  }
  export type type = LibStorageService
}
