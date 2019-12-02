//
// Google Cloud Storage: Node.js Client
// https://googleapis.dev/nodejs/storage/latest/index.html
//

import * as admin from 'firebase-admin'
import * as path from 'path'
import * as uuidv4 from 'uuid/v4'
import { Req, Res } from '@nestjs/common'
import { Request, Response } from 'express'
import { removeBothEndsSlash, removeEndSlash, removeStartSlash, splitFilePath } from 'web-base-lib'
import { Dayjs } from 'dayjs'
import { File } from '@google-cloud/storage'
import { IdToken } from '../nest'
import { UserRecord } from 'firebase-functions/lib/providers/auth'
import { config } from '../base'
const dayjs = require('dayjs')

type StorageUser = Pick<IdToken, 'uid' | 'storageDir'> | Pick<UserRecord, 'uid' | 'customClaims'>

export enum StorageNodeType {
  File = 'File',
  Dir = 'Dir',
}

export interface StorageNode {
  nodeType: StorageNodeType
  name: string
  dir: string
  path: string
  created?: Dayjs
  updated?: Dayjs
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

export abstract class BaseStorageService {
  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

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
   * Cloud Storageから指定されたディレクトリのノード一覧を取得します。
   *
   * 引数が次のように指定された場合、
   *   + dirPath: "photos"
   *   + basePath: "home"
   *
   * 次のようなノードが取得されます。
   *   + "home/photos/family.png"
   *   + "home/photos/children.png"
   *
   * 戻り値は基準パスのノードが除去され、次のようなノードが返されます。
   *   + "photos/family.png"
   *   + "photos/children.png"
   *
   * @param dirPath
   * @param basePath
   */
  async getStorageDirNodes(dirPath?: string, basePath?: string): Promise<StorageNode[]> {
    // Cloud Storageから指定されたディレクトリのノードを取得
    const nodeMap = await this.getStorageNodeMap(dirPath, basePath)

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
  async getUserStorageDirNodes(user: StorageUser, dirPath?: string): Promise<StorageNode[]> {
    const userDirPath = this.getUserStorageDirPath(user)
    return this.getStorageDirNodes(dirPath, userDirPath)
  }

  /**
   * Cloud Storageのディレクトリを作成します。
   *
   * 引数が次のように指定された場合、
   *   + dirPaths[0]: "photos"
   *   + dirPaths[1]: "docs"
   *   + basePath: "home"
   *
   * 次のディレクトリが作成されます。
   *   + "home/photos"
   *   + "home/docs"
   *
   * 戻り値は基準パスのノードが除去され、次のようなノードが返されます。
   *   + "photos"
   *   + "docs"
   *
   * @param dirPaths
   * @param basePath
   */
  async createStorageDirs(dirPaths: string[], basePath = ''): Promise<StorageNode[]> {
    const bucket = admin.storage().bucket()
    const result: StorageNode[] = []
    basePath = removeBothEndsSlash(basePath)

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
  async createUserStorageDirs(user: StorageUser, dirPaths: string[]): Promise<StorageNode[]> {
    const userDirPath = this.getUserStorageDirPath(user)
    return this.createStorageDirs(dirPaths, userDirPath)
  }

  /**
   * Cloud Storageからファイルノードを削除します。
   *
   * 引数が次のように指定された場合、
   *   + filePaths[0]: "photos/family.png"
   *   + filePaths[1]: "photos/children.png"
   *   + basePath: "home"
   *
   * 次のファイルが削除されます。
   *   + "home/photos/family.png"
   *   + "home/photos/children.png"
   *
   * 戻り値は基準パスのノードが除去され、次のようなノードが返されます。
   *   + "photos/family.png"
   *   + "photos/children.png"
   *
   * @param filePaths
   * @param basePath
   */
  async removeStorageFiles(filePaths: string[], basePath = ''): Promise<StorageNode[]> {
    const bucket = admin.storage().bucket()
    const nodeMap: { [path: string]: StorageNode } = {}

    const promises: Promise<void>[] = []
    for (const filePath of filePaths) {
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
  async removeUserStorageFiles(user: StorageUser, filePaths: string[]): Promise<StorageNode[]> {
    const userDirPath = this.getUserStorageDirPath(user)
    return this.removeStorageFiles(filePaths, userDirPath)
  }

  /**
   * Cloud Storageから指定されたディレクトリを含め配下のノードを削除します。
   *
   * 引数が次のように指定された場合、
   *   + dirPath: "photos"
   *   + basePath: "home"
   *
   * 次のようなディレクトリ、ファイルが削除されます。
   *   + "home/photos"
   *   + "home/photos/family.png"
   *   + "home/photos/children.png"
   *
   * 戻り値は基準パスのノードが除去され、次のようなノードが返されます。
   *   + "photos"
   *   + "photos/family.png"
   *   + "photos/children.png"
   *
   * @param dirPath
   * @param basePath
   */
  async removeStorageDir(dirPath: string, basePath = ''): Promise<StorageNode[]> {
    // Cloud Storageから指定されたディレクトリのノードを取得
    const nodeMap = await this.getStorageNodeMap(dirPath, basePath)
    // 親ディレクトリの穴埋め
    this.padVirtualDirNode(nodeMap, dirPath)

    // Cloud Storageから取得したノードを削除
    const promises: Promise<StorageNode>[] = []
    for (const node of Object.values(nodeMap)) {
      if (node.exists) {
        promises.push(node.gcsNode.delete().then(() => node))
      }
    }
    const nodes = await Promise.all(promises)

    this.sortStorageNodes(nodes)
    return nodes
  }

  /**
   * Cloud Storageのユーザーディレクトリ配下にあるファイルを削除します。。
   * @param user
   * @param dirPath
   */
  async removeUserStorageDir(user: StorageUser, dirPath: string): Promise<StorageNode[]> {
    const userDirPath = this.getUserStorageDirPath(user)
    return this.removeStorageDir(dirPath, userDirPath)
  }

  /**
   * Cloud Storageのディレクトリを指定されたディレクトリへ移動します。
   *
   * 引数が次のように指定された場合、
   *   + dirNode: "photos"
   *   + toDirPath: "archives/photos"
   *   + basePath: "home"
   *
   * 次のようなディレクトリの移動が行われます。
   *
   *   + 移動元: "home/photos"
   *   + 移動先: "home/archives/photos"
   *
   * 戻り値は基準パスのノードが除去され、次のようなノードが返されます。
   *   + "archives/photos"
   *   + "archives/photos/20190101"
   *   + "archives/photos/20190101/family1.png"
   *
   * 移動元ディレクトリまたは移動先ディレクトリがない場合は移動は行われず、空配列が返されます。
   *
   * @param fromDirPath
   * @param toDirPath
   * @param basePath
   */
  async moveStorageDirNode(fromDirPath: string, toDirPath: string, basePath = ''): Promise<StorageNode[]> {
    fromDirPath = removeBothEndsSlash(fromDirPath)
    toDirPath = removeBothEndsSlash(toDirPath)
    basePath = removeBothEndsSlash(basePath)

    // 移動先ディレクトリが移動元のサブディレクトリでないことを確認
    // from: aaa/bbb → to: aaa/bbb/ccc/bbb [NG]
    //               → to: aaa/zzz/ccc/bbb [OK]
    if (toDirPath.startsWith(fromDirPath)) {
      return []
    }

    // 移動元ディレクトリ配下のノードを取得
    const nodeMap = await this.getStorageNodeMap(fromDirPath, basePath)
    const dirNode = nodeMap[fromDirPath]
    if (!dirNode || !dirNode.exists) {
      return []
    }
    // 親ディレクトリの穴埋め
    this.padVirtualDirNode(nodeMap, fromDirPath)
    // 移動元ディレクトリと配下のノードは別処理を行うのでnodeMapからは削除
    delete nodeMap[fromDirPath]

    // 移動先ディレクトリの存在確認
    const toDirParentPath = path.join(path.dirname(toDirPath), '/')
    const toDirParentNode = await this.getStorageDirNode(toDirParentPath, basePath)
    if (!toDirParentNode.exists) {
      return []
    }

    const result: StorageNode[] = []

    // 移動元ディレクトリの移動処理
    {
      const newDirNodePath = path.join(toDirPath, '/')
      await dirNode.gcsNode!.move(path.join(basePath, newDirNodePath))
      const movedNode = (await this.getStorageDirNode(newDirNodePath, basePath))!
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
          const movedNode = await this.getStorageDirNode(newNodePath, basePath)
          result.push(movedNode!)
        }
        // ディレクトリが存在しない場合、ディレクトリを移動先に作成
        else {
          const createdNode = (await this.createStorageDirs([newNodePath], basePath))[0]
          result.push(createdNode)
        }
      }
      // ノードがファイルの場合
      else {
        await node.gcsNode!.move(path.join(basePath, newNodePath))
        const movedNode = await this.getStorageFileNode(newNodePath, basePath)
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
   * @param dirPath
   * @param toDirPath
   */
  async moveUserStorageDirNode(user: StorageUser, dirPath: string, toDirPath: string): Promise<StorageNode[]> {
    const userDirPath = this.getUserStorageDirPath(user)
    return this.moveStorageDirNode(dirPath, toDirPath, userDirPath)
  }

  /**
   * Cloud Storageのファイルを指定されたディレクトリへ移動します。
   *
   * 引数が次のように指定された場合、
   *   + filePath: "photos/family.png"
   *   + toFilePath: "archives/family.png"
   *   + basePath: "home"
   *
   * 次のようなファイルの移動が行われます。
   *
   *   + 移動元: "home/photos/family.png"
   *   + 移動先: "home/archives/family.png"
   *
   * 戻り値は基準パスのノードが除去され、次のようなノードが返されます。
   *   + "archives/family.png"
   *
   * 移動元ファイルまたは移動先ディレクトリがない場合は移動は行われず、戻り値は何も返しません。
   *
   * @param filePath
   * @param toFilePath
   * @param basePath
   */
  async moveStorageFileNode(filePath: string, toFilePath: string, basePath = ''): Promise<StorageNode | undefined> {
    filePath = removeBothEndsSlash(filePath)
    toFilePath = removeBothEndsSlash(toFilePath)
    basePath = removeBothEndsSlash(basePath)

    // 移動元ファイルの存在確認
    const fileNode = await this.getStorageNode(filePath, basePath)
    if (!fileNode.exists) {
      return
    }

    // 移動先ディレクトリの存在確認
    const toDirPath = path.join(path.dirname(toFilePath), '/')
    const toDirNode = await this.getStorageNode(toDirPath, basePath)
    if (!toDirNode.exists) {
      return
    }

    // ファイルの移動
    await fileNode.gcsNode!.move(path.join(basePath, toFilePath))

    return this.getStorageNode(toFilePath, basePath)
  }

  /**
   * Cloud Storageのユーザーディレクトリ配下にあるファイルを指定されたディレクトリへ移動します。
   * 移動元ファイルまたは移動先ディレクトリがない場合は移動は行われず、戻り値は何も返しません。
   * @param user
   * @param filePath
   * @param toDirPath
   */
  async moveUserStorageFileNode(user: StorageUser, filePath: string, toDirPath: string): Promise<StorageNode | undefined> {
    const userDirPath = this.getUserStorageDirPath(user)
    return this.moveStorageFileNode(filePath, toDirPath, userDirPath)
  }

  /**
   * Cloud Storageのディレクトリの名前変更を行います。
   *
   * 引数が次のように指定された場合、
   *   + dirNode: "photos"
   *   + newName: "my-photos"
   *   + basePath: "home"
   *
   * 次のようなディレクトリの名前変更が行われます。
   *
   *   + 移動元: "home/photos"
   *   + 移動先: "home/my-photos"
   *
   * 戻り値は基準パスのノードが除去され、次のようなノードが返されます。
   *   + "my-photos"
   *   + "my-photos/20190101"
   *   + "my-photos/20190101/family1.png"
   *
   * リネームするディレクトリがない場合はリネームは行われず、空配列が返されます。
   *
   * @param dirPath
   * @param newName
   * @param basePath
   */
  async renameStorageDirNode(dirPath: string, newName: string, basePath = ''): Promise<StorageNode[]> {
    dirPath = removeBothEndsSlash(dirPath)

    const reg = new RegExp(`${path.basename(dirPath)}$`)
    const toDirPath = dirPath.replace(reg, newName)
    return this.moveStorageDirNode(dirPath, toDirPath, basePath)
  }

  /**
   * Cloud Storageのユーザーディレクトリ配下にあるディレクトリのリネームを行います。
   * リネームするディレクトリがない場合はリネームは行われず、空配列が返されます。
   * @param user
   * @param dirPath
   * @param newName
   */
  async renameUserStorageDirNode(user: StorageUser, dirPath: string, newName: string): Promise<StorageNode[]> {
    const userDirPath = this.getUserStorageDirPath(user)
    return this.renameStorageDirNode(dirPath, newName, userDirPath)
  }

  /**
   * Cloud Storageのファイルの名前変更を行います。
   *
   * 引数が次のように指定された場合、
   *   + filePath: "photos/family.png"
   *   + newName: "my-family.png"
   *   + basePath: "home"
   *
   * 次のような名前変更が行われます。
   *
   *   + 移動元: "home/photos/family.png"
   *   + 移動先: "home/photos/my-family.png"
   *
   * 戻り値は基準パスのノードが除去され、次のようなノードが返されます。
   *   + "photos/my-family.png"
   *
   * リネームするファイルがない場合は移動は行われず、戻り値は何も返しません。
   *
   * @param filePath
   * @param newName
   * @param basePath
   */
  async renameStorageFileNode(filePath: string, newName: string, basePath = ''): Promise<StorageNode | undefined> {
    filePath = removeBothEndsSlash(filePath)

    const reg = new RegExp(`${path.basename(filePath)}$`)
    const toFilePath = filePath.replace(reg, newName)
    return this.moveStorageFileNode(filePath, toFilePath, basePath)
  }

  /**
   * Cloud Storageのユーザーディレクトリ配下にあるファイルのリネームを行います。
   * リネームするファイルがない場合はリネームは行われず、戻り値は何も返しません。
   * @param user
   * @param filePath
   * @param newName
   */
  async renameUserStorageFileNode(user: StorageUser, filePath: string, newName: string): Promise<StorageNode | undefined> {
    const userDirPath = this.getUserStorageDirPath(user)
    return this.renameStorageFileNode(filePath, newName, userDirPath)
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
   *   ディレクトリパスを指定する場合は末尾に"/"を付与するよう注意してください。
   * @param basePath
   */
  async getStorageNode(nodePath: string, basePath = ''): Promise<GCSStorageNode> {
    nodePath = removeStartSlash(nodePath)
    basePath = removeBothEndsSlash(basePath)

    const bucket = admin.storage().bucket()
    const gcsNodePath = path.join(basePath, nodePath)
    const gcsNode = bucket.file(gcsNodePath)
    const node = this.toStorageNode(gcsNode, basePath) as GCSStorageNode
    node.exists = (await gcsNode.exists())[0]
    node.gcsNode = gcsNode
    return node
  }

  /**
   * Cloud Storageからディレクトリノードを取得します。
   * @param dirPath
   * @param basePath
   */
  async getStorageDirNode(dirPath: string, basePath = ''): Promise<GCSStorageNode> {
    return this.getStorageNode(path.join(dirPath, '/'), basePath)
  }

  /**
   * Cloud Storageからファイルノードを取得します。
   * @param filePath
   * @param basePath
   */
  async getStorageFileNode(filePath: string, basePath = ''): Promise<GCSStorageNode> {
    return this.getStorageNode(removeEndSlash(filePath), basePath)
  }

  /**
   * Cloud Storageからノードを取得します。
   * `dirPath`を指定すると、このディレクトリパス配下のノードを取得します。
   * @param dirPath
   * @param basePath
   */
  async getStorageNodeMap(dirPath = '', basePath = ''): Promise<{ [path: string]: GCSStorageNode }> {
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
  toStorageNode(gcsNode: File, basePath = ''): GCSStorageNode {
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
  toDirStorageNode(dirPath: string): StorageNode {
    const dirPathSegments = dirPath.split('/')
    const name = dirPathSegments[dirPathSegments.length - 1]
    const dir = dirPathSegments.slice(0, dirPathSegments.length - 1).join('/')

    return {
      nodeType: StorageNodeType.Dir,
      name,
      dir,
      path: dirPathSegments.join('/'),
    }
  }

  /**
   * ノード配列をディレクトリ階層に従ってソートします。
   * @param nodes
   */
  sortStorageNodes(nodes: StorageNode[]): void {
    nodes.sort((a, b) => {
      // ソート用文字列(strA, strB)の説明:
      //   ノードがファイルの場合、同じ階層にあるディレクトリより順位を下げるために
      //   大きな文字コード"0xffff"を付加している。これにより同一階層のファイルと
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
   * Cloud Storageのユーザーディレクトリのパスを取得します。
   * @param user
   */
  getUserStorageDirPath(user: StorageUser): string {
    const usersDir = config.storage.usersDir
    if ((user as IdToken).storageDir) {
      return `${usersDir}/${(user as IdToken).storageDir}`
    } else if ((user as UserRecord).customClaims) {
      const customClaims = (user as UserRecord).customClaims!
      const storageDir = (customClaims as any).storageDir
      if (storageDir) {
        return storageDir ? `${usersDir}/${storageDir}` : ''
      }
    }
    throw new Error(`User (uid: "${user.uid}") does not have a storage directory assigned.`)
  }

  /**
   * Cloud Storageに指定されたユーザーのディレクトリを割り当てます。
   * @param user
   */
  async assignUserStorageDir(user: UserRecord): Promise<void> {
    // 既に割り当てられている場合は終了
    if (user.customClaims && (user.customClaims as any).storageDir) return

    // ユーザークレームに"storageDir"というプロパティを追加
    // このプロパティに設定される値がユーザーディレクトリとなる
    const storageDir = uuidv4()
    await admin.auth().setCustomUserClaims(user.uid, {
      storageDir,
    })
    ;(user.customClaims as any).storageDir = storageDir
  }

  /**
   * 親ディレクトリがない場合、仮想的にディレクトリを作成して穴埋めします。
   * このようなことを行う理由として、Cloud Storageは親ディレクトリが存在しないことがあるためです。
   * 例えば、"aaa/bbb/family.png"の場合、"aaa/bbb/"というディレクトリがない場合があります。
   * このように親ディレクトリがない場合、仮想的にディレクトリを作成して穴埋めします。
   *
   * `basePath`は基準パスで、このパスより上位のディレクトリは作成しません。
   * 例えば、"aaa/bbb/ccc/family.png"というノードがあり、ディレクトリが存在しないとします。
   * この条件で`basePath`に"aaa/bbb"を指定すると次のようにディレクトリノードが作成されます。
   * + "aaa" ← 基準パスより上なので作成されない
   * + "aaa/bbb" ← 作成される
   * + "aaa/bbb/ccc" ← 作成される
   *
   * @param nodeMap
   * @param basePath
   */
  padVirtualDirNode(nodeMap: { [path: string]: GCSStorageNode }, basePath?: string): void {
    basePath = removeBothEndsSlash(basePath)
    // 指定された全ノードの階層的なディレクトリパスを取得
    const dirPaths = Object.values(nodeMap).map(node => node.dir)
    const hierarchicalDirPaths = this.splitHierarchicalDirPaths(...dirPaths)

    // 親ディレクトリがない場合、仮想的にディレクトリを作成して穴埋めする
    const bucket = admin.storage().bucket()
    for (const dirPath of hierarchicalDirPaths) {
      if (basePath && !dirPath.startsWith(basePath)) continue
      if (nodeMap[dirPath]) continue
      const dirNode = this.toDirStorageNode(dirPath) as GCSStorageNode
      dirNode.exists = false
      dirNode.gcsNode = bucket.file(dirPath)
      nodeMap[dirPath] = dirNode
    }
  }

  /**
   * 指定されたディレクトリパスを階層的に分割します。
   *
   * 例: "aaa/bbb/ccc"が指定された場合、
   *    ["aaa", "aaa/bbb", "aaa/bbb/ccc"]を返します。
   *
   * @param dirPaths
   */
  splitHierarchicalDirPaths(...dirPaths: string[]): string[] {
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
  summarizeDirPaths(dirPaths: string[]): string[] {
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
}
