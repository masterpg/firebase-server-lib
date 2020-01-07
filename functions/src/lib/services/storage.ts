//
// Google Cloud Storage: Node.js Client
// https://googleapis.dev/nodejs/storage/latest/index.html
//

import * as admin from 'firebase-admin'
import * as path from 'path'
import * as uuidv4 from 'uuid/v4'
import { InputValidationError, config } from '../base'
import { Req, Res } from '@nestjs/common'
import { Request, Response } from 'express'
import { removeBothEndsSlash, removeEndSlash, removeStartSlash, splitFilePath } from 'web-base-lib'
import { Dayjs } from 'dayjs'
import { File } from '@google-cloud/storage'
import { IdToken } from '../nest'
import { UserRecord } from 'firebase-functions/lib/providers/auth'
const dayjs = require('dayjs')

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
  created: Dayjs
  updated: Dayjs
}

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
  //  Methods
  //
  //----------------------------------------------------------------------

  /**
   * Cloud Storageから指定されたディレクトリのノード一覧を取得します。
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
   * @param dirPath
   * @param basePath
   */
  async getDirNodes(dirPath?: string, basePath?: string): Promise<StorageNode[]> {
    // Cloud Storageから指定されたディレクトリのノードを取得
    const nodeMap = await this.getNodeMap(dirPath, basePath)

    // 親ディレクトリの穴埋め
    this.padVirtualDirNode(nodeMap)

    // ディレクトリ階層を表現できるようノード配列をソート
    const result = Object.values(nodeMap)
    this.sortStorageNodes(result)

    return result
  }

  /**
   * Cloud Storageのユーザーディレクトリから指定されたディレクトリのノード一覧を取得します。
   * @param user
   * @param dirPath
   */
  async getUserDirNodes(user: StorageUser, dirPath?: string): Promise<StorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.getDirNodes(dirPath, userDirPath)
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
  async createDirs(dirPaths: string[], basePath = ''): Promise<StorageNode[]> {
    const bucket = admin.storage().bucket()
    const result: StorageNode[] = []
    basePath = removeBothEndsSlash(basePath)

    dirPaths.forEach(dirPath => this.validatePath(dirPath))

    const promises: Promise<void>[] = []
    for (const dirPath of this.splitHierarchicalDirPaths(...dirPaths)) {
      promises.push(
        (async () => {
          const gcsDirPath = path.join(basePath, dirPath, '/')
          const gcsDirNode = bucket.file(gcsDirPath)
          const exists = (await gcsDirNode.exists())[0]
          if (exists) return
          await gcsDirNode.save('')
          result.push(this.toStorageNode(gcsDirNode, basePath))
        })()
      )
    }
    await Promise.all(promises)

    this.sortStorageNodes(result)
    return result
  }

  /**
   * Cloud Storageのユーザーディレクトリ配下にディレクトリを作成します。
   * @param user
   * @param dirPaths
   */
  async createUserDirs(user: StorageUser, dirPaths: string[]): Promise<StorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.createDirs(dirPaths, userDirPath)
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
  async removeDirs(dirPaths: string[], basePath = ''): Promise<StorageNode[]> {
    const remove = async (dirPath: string, basePath = '') => {
      dirPath = removeBothEndsSlash(dirPath)
      if (!dirPath) return Promise.resolve([])

      // Cloud Storageから指定されたディレクトリのノードを取得
      const nodeMap = await this.getNodeMap(dirPath, basePath)
      // 親ディレクトリの穴埋め
      this.padVirtualDirNode(nodeMap, dirPath)

      // Cloud Storageから取得したノードを削除
      const promises: Promise<StorageNode>[] = []
      for (const node of Object.values(nodeMap)) {
        if (node.exists) {
          promises.push(node.gcsNode.delete().then(() => node))
        }
      }
      return await Promise.all(promises)
    }

    const result: StorageNode[] = []

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
  async removeUserDirs(user: StorageUser, dirPaths: string[]): Promise<StorageNode[]> {
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
  async removeFiles(filePaths: string[], basePath = ''): Promise<StorageNode[]> {
    const bucket = admin.storage().bucket()
    const nodeMap: { [path: string]: StorageNode } = {}

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

    return filePaths.reduce<StorageNode[]>((result, filePath) => {
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
  async removeUserFiles(user: StorageUser, filePaths: string[]): Promise<StorageNode[]> {
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
  async moveDir(fromDirPath: string, toDirPath: string, basePath = ''): Promise<StorageNode[]> {
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
    const nodeMap = await this.getNodeMap(fromDirPath, basePath)
    const dirNode = nodeMap[fromDirPath]
    if (!dirNode || !dirNode.exists) {
      throw new Error(`The source directory does not exist: '${path.join(basePath, fromDirPath)}'`)
    }
    // 親ディレクトリの穴埋め
    this.padVirtualDirNode(nodeMap, fromDirPath)
    // 移動元ディレクトリと配下のノードは別処理を行うのでnodeMapからは削除
    delete nodeMap[fromDirPath]

    // 移動先ディレクトリの存在確認
    // (アプリケーションまたはユーザーディレクトリ直下へ移動する場合は確認しない)
    if (path.dirname(toDirPath) !== '.') {
      const toDirParentPath = path.join(path.dirname(toDirPath), '/')
      const toDirParentNode = await this.getDirNode(toDirParentPath, basePath)
      if (!toDirParentNode.exists) {
        throw new Error(`The destination directory does not exist: '${path.join(basePath, toDirParentNode.path)}'`)
      }
    }

    const result: StorageNode[] = []

    // 移動元ディレクトリの移動処理
    {
      const newDirNodePath = path.join(toDirPath, '/')
      await dirNode.gcsNode!.move(path.join(basePath, newDirNodePath))
      const movedNode = (await this.getDirNode(newDirNodePath, basePath))!
      result.push(movedNode!)
    }

    // 移動元ディレクトリ配下のノードの移動処理
    for (const node of Object.values(nodeMap)) {
      // 移動元ノードのパスを移動先のパスへ変換
      const reg = new RegExp(`^${fromDirPath}`)
      const newNodePath = node.path.replace(reg, toDirPath)
      // 移動ノードがディレクトリの場合
      if (node.nodeType === StorageNodeType.Dir) {
        // ディレクトリが存在する場合、そのディレクトリを移動
        if (node.exists) {
          await node.gcsNode!.move(path.join(basePath, newNodePath, '/'))
          const movedNode = await this.getDirNode(newNodePath, basePath)
          result.push(movedNode!)
        }
        // ディレクトリが存在しない場合、ディレクトリを移動先に作成
        else {
          const createdNode = (await this.createDirs([newNodePath], basePath))[0]
          result.push(createdNode)
        }
      }
      // ノードがファイルの場合
      else {
        await node.gcsNode!.move(path.join(basePath, newNodePath))
        const movedNode = await this.getFileNode(newNodePath, basePath)
        result.push(movedNode!)
      }
    }

    // 移動を行ったノード一覧をソート
    this.sortStorageNodes(result)

    return result
  }

  /**
   * Cloud Storageのユーザーディレクトリを指定されたディレクトリへ移動します。
   * 移動元ディレクトリまたは移動先ディレクトリがない場合は移動は行われず、空配列が返されます。
   * @param user
   * @param fromDirPath
   * @param toDirPath
   */
  async moveUserDir(user: StorageUser, fromDirPath: string, toDirPath: string): Promise<StorageNode[]> {
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
   * 移動元ファイルまたは移動先ディレクトリがない場合は移動は行われず、戻り値は何も返しません。
   *
   * @param fromFilePath
   * @param toFilePath
   * @param basePath
   */
  async moveFile(fromFilePath: string, toFilePath: string, basePath = ''): Promise<StorageNode> {
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

    // ファイルの移動
    await fileNode.gcsNode!.move(path.join(basePath, toFilePath))

    return this.getFileNode(toFilePath, basePath)
  }

  /**
   * Cloud Storageのユーザーディレクトリ配下にあるファイルを指定されたディレクトリへ移動します。
   * 移動元ファイルまたは移動先ディレクトリがない場合は移動は行われず、戻り値は何も返しません。
   * @param user
   * @param fromFilePath
   * @param toDirPath
   */
  async moveUserFile(user: StorageUser, fromFilePath: string, toDirPath: string): Promise<StorageNode> {
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
   *   + 移動元: 'home/photos'
   *   + 移動先: 'home/my-photos'
   *
   * 戻り値は基準パスのノードが除去され、次のようなノードが返されます。
   *   + 'my-photos'
   *   + 'my-photos/20190101'
   *   + 'my-photos/20190101/family1.png'
   *
   * リネームするディレクトリがない場合はリネームは行われず、空配列が返されます。
   *
   * @param dirPath
   * @param newName
   * @param basePath
   */
  async renameDir(dirPath: string, newName: string, basePath = ''): Promise<StorageNode[]> {
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
   * リネームするディレクトリがない場合はリネームは行われず、空配列が返されます。
   * @param user
   * @param dirPath
   * @param newName
   */
  async renameUserDir(user: StorageUser, dirPath: string, newName: string): Promise<StorageNode[]> {
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
   *
   *   + 移動元: 'home/photos/family.png'
   *   + 移動先: 'home/photos/my-family.png'
   *
   * 戻り値は基準パスのノードが除去され、次のようなノードが返されます。
   *   + 'photos/my-family.png'
   *
   * リネームするファイルがない場合は移動は行われず、戻り値は何も返しません。
   *
   * @param filePath
   * @param newName
   * @param basePath
   */
  async renameFile(filePath: string, newName: string, basePath = ''): Promise<StorageNode> {
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
   * リネームするファイルがない場合はリネームは行われず、戻り値は何も返しません。
   * @param user
   * @param filePath
   * @param newName
   */
  async renameUserFile(user: StorageUser, filePath: string, newName: string): Promise<StorageNode> {
    const userDirPath = this.getUserDirPath(user)
    return this.renameFile(filePath, newName, userDirPath)
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
  async getNode(nodePath: string, basePath = ''): Promise<GCSStorageNode> {
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
  async getDirNode(dirPath: string, basePath = ''): Promise<GCSStorageNode> {
    return this.getNode(path.join(dirPath, '/'), basePath)
  }

  /**
   * Cloud Storageからファイルノードを取得します。
   * @param filePath
   * @param basePath
   */
  async getFileNode(filePath: string, basePath = ''): Promise<GCSStorageNode> {
    return this.getNode(removeEndSlash(filePath), basePath)
  }

  /**
   * Cloud Storageからノードを取得します。
   * `dirPath`を指定すると、このディレクトリパス配下のノードを取得します。
   * @param dirPath
   * @param basePath
   */
  async getNodeMap(dirPath = '', basePath = ''): Promise<{ [path: string]: GCSStorageNode }> {
    // 引数のディレクトリパスをCloud Storageのパスへ変換
    let gcsDirPath = ''
    if (dirPath || basePath) {
      basePath = removeBothEndsSlash(basePath)
      dirPath = removeBothEndsSlash(dirPath)
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
   * クライアントから指定されたファイルをレスポンスします。
   * @param req
   * @param res
   * @param filePath
   */
  async sendFile(@Req() req: Request, @Res() res: Response, filePath: string): Promise<Response> {
    const bucket = admin.storage().bucket()
    const file = bucket.file(filePath)
    const exists = (await file.exists())[0]
    if (!exists) {
      return res.sendStatus(404)
    }

    const lastModified = dayjs(file.metadata.updated).toString()
    const ifModifiedSinceStr = req.header('If-Modified-Since')
    const ifModifiedSince = ifModifiedSinceStr ? dayjs(ifModifiedSinceStr).toString() : undefined
    if (lastModified === ifModifiedSince) {
      return res.sendStatus(304)
    }

    res.setHeader('Last-Modified', lastModified)
    res.setHeader('Content-Type', file.metadata.contentType)
    const fileStream = file.createReadStream()

    fileStream.pipe(res)
    return res
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
      myDirName = uuidv4()
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
      return `${usersDir}/${myDirName}`
    }
    throw new Error(`User (uid: '${user.uid}') does not have a storage directory assigned.`)
  }

  /**
   * ローカルファイルをCloud Storageへアップロードします。
   * @param uploadList
   * @param basePath
   */
  async uploadLocalFiles(uploadList: { localFilePath: string; toFilePath: string }[], basePath = ''): Promise<StorageNode[]> {
    const bucket = admin.storage().bucket()
    basePath = removeBothEndsSlash(basePath)

    const uploadedFileMap: { [path: string]: StorageNode } = {}
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

    return uploadList.reduce<StorageNode[]>((result, item) => {
      result.push(uploadedFileMap[removeStartSlash(item.toFilePath)])
      return result
    }, [])
  }

  /**
   * 指定されたデータをファイルとしてCloud Storageへアップロードします。
   * @param uploadList
   */
  async uploadAsFiles(uploadList: UploadDataItem[]): Promise<StorageNode[]> {
    const bucket = admin.storage().bucket()

    const uploadedFileMap: { [path: string]: StorageNode } = {}
    const promises: Promise<void>[] = []
    for (const uploadItem of uploadList) {
      promises.push(
        (async () => {
          const gcsFileNode = bucket.file(uploadItem.path)
          await gcsFileNode.save(uploadItem.data, { contentType: uploadItem.contentType })
          const fileNode = this.toStorageNode(gcsFileNode)
          uploadedFileMap[fileNode.path] = this.toStorageNode(gcsFileNode)
        })()
      )
    }
    await Promise.all(promises)

    return uploadList.reduce<StorageNode[]>((result, item) => {
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
  protected toStorageNode(gcsNode: File, basePath = ''): GCSStorageNode {
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
      size: Number(gcsNode.metadata.size),
      created: dayjs(gcsNode.metadata.timeCreated),
      updated: dayjs(gcsNode.metadata.updated),
      exists: true,
      gcsNode: gcsNode,
    }
  }

  /**
   * 指定されたディレクトリパスをStorageNodeのディレクトリノードへ変換します。
   * @param dirPath
   */
  protected toStorageNodeByDir(dirPath: string): StorageNode {
    const dirPathSegments = dirPath.split('/')
    const name = dirPathSegments[dirPathSegments.length - 1]
    const dir = dirPathSegments.slice(0, dirPathSegments.length - 1).join('/')

    return {
      nodeType: StorageNodeType.Dir,
      name,
      dir,
      path: dirPathSegments.join('/'),
      contentType: '',
      size: 0,
      created: dayjs(0),
      updated: dayjs(0),
    }
  }

  /**
   * ノード配列をディレクトリ階層に従ってソートします。
   * @param nodes
   */
  protected sortStorageNodes(nodes: StorageNode[]): void {
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
  }

  /**
   * 親ディレクトリがない場合、仮想的にディレクトリを作成して穴埋めします。
   * このようなことを行う理由として、Cloud Storageは親ディレクトリが存在しないことがあるためです。
   * 例えば、'aaa/bbb/family.png'の場合、'aaa/bbb/'というディレクトリがない場合があります。
   * このように親ディレクトリがない場合、仮想的にディレクトリを作成して穴埋めします。
   *
   * `basePath`は基準パスで、このパスより上位のディレクトリは作成しません。
   * 例えば、'aaa/bbb/ccc/family.png'というノードがあり、ディレクトリが存在しないとします。
   * この条件で`basePath`に'aaa/bbb'を指定すると次のようにディレクトリノードが作成されます。
   * + 'aaa' ← 基準パスより上なので作成されない
   * + 'aaa/bbb' ← 作成される
   * + 'aaa/bbb/ccc' ← 作成される
   *
   * @param nodeMap
   * @param basePath
   */
  protected padVirtualDirNode(nodeMap: { [path: string]: GCSStorageNode }, basePath?: string): void {
    basePath = removeBothEndsSlash(basePath)
    // 指定された全ノードの階層的なディレクトリパスを取得
    const dirPaths = Object.values(nodeMap).map(node => node.dir)
    const hierarchicalDirPaths = this.splitHierarchicalDirPaths(...dirPaths)

    // 親ディレクトリがない場合、仮想的にディレクトリを作成して穴埋めする
    const bucket = admin.storage().bucket()
    for (const dirPath of hierarchicalDirPaths) {
      if (basePath && !dirPath.startsWith(basePath)) continue
      if (nodeMap[dirPath]) continue
      const dirNode = this.toStorageNodeByDir(dirPath) as GCSStorageNode
      dirNode.exists = false
      dirNode.gcsNode = bucket.file(dirPath)
      nodeMap[dirPath] = dirNode
    }
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

    return Array.from(set)
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

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

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
}

export namespace LibStorageServiceDI {
  export const symbol = Symbol(LibStorageService.name)
  export const provider = {
    provide: symbol,
    useClass: LibStorageService,
  }
  export type type = LibStorageService
}
