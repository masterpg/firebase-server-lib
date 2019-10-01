//
// Google Cloud Storage: Node.js Client
// https://googleapis.dev/nodejs/storage/latest/index.html
//

import * as admin from 'firebase-admin'
import * as path from 'path'
import { Bucket, File } from '@google-cloud/storage'
import { StorageNode, StorageNodeType, SignedUploadUrlInput as _SignedUploadUrlInput, StorageNode as _StorageNode } from './types'
import { IdToken } from '../base'
import { Injectable } from '@nestjs/common'
import { InputValidationError } from '../../base/validator'
import { config } from '../../base/config'
const isString = require('lodash/isString')

export class SignedUploadUrlInput implements _SignedUploadUrlInput {
  filePath!: string

  contentType?: string
}

export interface GCSStorageNode extends _StorageNode {
  gcsNode?: File
}

@Injectable()
export class StorageService {
  async getUserStorageNodes(user: IdToken, dirPath?: string): Promise<StorageNode[]> {
    if (dirPath && !dirPath.endsWith('/')) {
      throw new InputValidationError(`The argument 'dirPath' must end with '/'.`)
    }

    // Cloud Storageから指定されたディレクトリのノードを取得
    const userDirPath = this.getUserStorageDirPath(user)
    let nodeMap = await this.getStorageNodeMap(dirPath, userDirPath)

    // 親ディレクトリの穴埋め
    this.padVirtualDirNode(nodeMap)

    // ルートディレクトリ、または指定されたディレクトリのノードを除去する
    delete nodeMap[removeEndSlash(dirPath)]

    // ディレクトリ階層を表現できるようノード配列をソートする
    const result = Object.values(nodeMap)
    this.sortStorageNodes(result)

    return result
  }

  async createUserStorageDirs(user: IdToken, dirPaths: string[]): Promise<StorageNode[]> {
    for (const dirPath of dirPaths) {
      if (dirPath && !dirPath.endsWith('/')) {
        throw new InputValidationError(`The argument path of 'dirPaths' must end with '/'.`)
      }
    }

    const bucket = admin.storage().bucket()
    const userDirPath = this.getUserStorageDirPath(user)
    const result: StorageNode[] = []

    const promises: Promise<void>[] = []
    for (const dirPath of this.splitHierarchicalDirPaths(...dirPaths)) {
      promises.push(
        this.createStorageDir(bucket, dirPath, userDirPath).then(storageNode => {
          if (storageNode) {
            result.push(storageNode)
          }
        })
      )
    }
    await Promise.all(promises)

    return result
  }

  async removeUserStorageNodes(user: IdToken, nodePaths: string[]): Promise<StorageNode[]> {
    const result: StorageNode[] = []

    const bucket = admin.storage().bucket()
    const userDirPath = this.getUserStorageDirPath(user)
    const promises: Array<Promise<void>> = []
    for (const nodePath of nodePaths) {
      const nodeType = this.getStorageNodeType(nodePath)
      // ノードがディレクトリの場合
      if (nodeType === StorageNodeType.Dir) {
        promises.push(
          this.removeStorageDirNode(bucket, nodePath, userDirPath).then(nodes => {
            result.push(...nodes)
          })
        )
      }
      // ノードがファイルの場合
      else if (nodeType === StorageNodeType.File) {
        promises.push(
          this.removeStorageFileNode(bucket, nodePath, userDirPath).then(node => {
            node && result.push(node)
          })
        )
      }
    }
    await Promise.all(promises)

    return result
  }

  async getSignedUploadUrls(requestOrigin: string, inputs: SignedUploadUrlInput[]): Promise<string[]> {
    if (!isString(requestOrigin)) {
      throw new InputValidationError('Request origin is not set.')
    }
    if (!config.cors.whitelist.includes(requestOrigin)) {
      throw new InputValidationError('Request origin is invalid.', { requestOrigin })
    }

    const result: string[] = []

    for (const input of inputs) {
      const { filePath, contentType } = input
      const { fileName, dirPath } = splitFilePath(filePath)
      const bucket = admin.storage().bucket()
      const gcsFilePath = path.join(dirPath, fileName)
      const gcsFileNode = bucket.file(gcsFilePath)

      const url = (await gcsFileNode.createResumableUpload({
        origin: requestOrigin,
        metadata: { contentType },
      }))[0]
      result.push(url)
    }

    return result
  }

  /**
   * Cloud Storageからノードを取得します。
   * `dirPath`を指定すると、このディレクトリパス配下のノードを取得します。
   * @param dirPath
   * @param basePath
   */
  async getStorageNodeMap(dirPath: string = '', basePath: string = ''): Promise<{ [path: string]: GCSStorageNode }> {
    // 引数のディレクトリパスをCloud Storageのパスへ変換
    let gcsDirPath = ''
    if (dirPath || basePath) {
      gcsDirPath = path.join(basePath, dirPath, '/')
    }

    // Cloud Storageから指定されたディレクトリのノードを取得
    const bucket = admin.storage().bucket()
    const gcsNodes = (await bucket.getFiles({ prefix: gcsDirPath }))[0] as File[]

    const result: { [path: string]: GCSStorageNode } = {}

    // 引数のディレクトリパス配下のノードをCloud Storageから取得
    for (const gcsNode of gcsNodes) {
      const node = this.toStorageNode(gcsNode, basePath) as GCSStorageNode
      node.gcsNode = gcsNode
      result[node.path] = node
    }

    return result
  }

  /**
   * Cloud Storageのディレクトリを作成します。
   * @param bucket
   * @param dirPath
   * @param basePath
   */
  async createStorageDir(bucket: Bucket, dirPath: string, basePath: string = ''): Promise<StorageNode | undefined> {
    const gcsDirPath = path.join(basePath, dirPath, '/')
    const gcsDirNode = bucket.file(gcsDirPath)
    const exists = (await gcsDirNode.exists())[0]
    if (exists) return undefined
    await gcsDirNode.save('')
    return this.toStorageNode(gcsDirNode, basePath)
  }

  /**
   * Cloud Storageからファイルノードを削除します。
   * @param bucket
   * @param filePath
   * @param basePath
   */
  async removeStorageFileNode(bucket: Bucket, filePath: string, basePath: string = ''): Promise<StorageNode | undefined> {
    const gcsFilePath = path.join(basePath, filePath)
    const gcsFileNode = bucket.file(gcsFilePath)
    const exists = (await gcsFileNode.exists())[0]
    if (exists) {
      return gcsFileNode.delete().then(() => {
        return this.toStorageNode(gcsFileNode, basePath)
      })
    }
    return undefined
  }

  /**
   * Cloud Storageから指定されたディレクトリ含め配下のノードを削除します。
   * @param bucket
   * @param dirPath
   * @param basePath
   */
  async removeStorageDirNode(bucket: Bucket, dirPath: string, basePath: string = ''): Promise<StorageNode[]> {
    // Cloud Storageから指定されたディレクトリのノードを取得
    let nodeMap = await this.getStorageNodeMap(dirPath, basePath)
    // 親ディレクトリの穴埋め
    this.padVirtualDirNode(nodeMap, dirPath)

    const promises: Promise<StorageNode>[] = []
    for (const node of Object.values(nodeMap)) {
      if (node.gcsNode) {
        promises.push(node.gcsNode.delete().then(() => node))
      } else {
        promises.push(new Promise<StorageNode>(resolve => resolve(node)))
      }
    }
    return Promise.all(promises)
  }

  /**
   * Cloud Storageから取得したノードをStorageNodeへ変換します。
   *
   * `basePath`が指定された場合、`gcsNode`のパスから基準パスが除去されます。
   * 引数が次のような場合:
   *   + `gcsNode`のパス: users/[USER_ID]/images/family.png
   *   + `basePath`: users/[USER_ID]
   * `gcsNode`のパスから基準パスが除去され、戻り値のノードパスは次のようになります:
   *   + images/family.png
   *
   * @param gcsNode Cloud Storageのノードを指定
   * @param basePath 基準パスを指定
   */
  toStorageNode(gcsNode: File, basePath: string = ''): StorageNode {
    let nodePath = removeEndSlash(gcsNode.name)
    if (basePath) {
      nodePath = removeEndSlash(gcsNode.name.replace(basePath, ''))
    }
    const relativePathSegments = nodePath.split('/')
    const name = relativePathSegments[relativePathSegments.length - 1]
    const dir = relativePathSegments.slice(0, relativePathSegments.length - 1).join('/')

    return {
      nodeType: this.getStorageNodeType(gcsNode.name),
      name,
      dir: removeStartSlash(dir),
      path: removeStartSlash(nodePath),
    }
  }

  /**
   * 指定されたディレクトリパスをStorageNodeのディレクトリノードへ変換します。
   * @param dirPath
   */
  toDirStorageNode(dirPath: string) {
    const dirPathSegments = dirPath.split('/')
    const name = dirPathSegments[dirPathSegments.length - 1]
    const dir = dirPathSegments.slice(0, dirPathSegments.length - 1).join('/')

    return { nodeType: StorageNodeType.Dir, name, dir, path: dirPathSegments.join('/') }
  }

  /**
   * ノード配列をディレクトリ階層に従ってソートします。
   * @param nodes
   * @param desc 降順にしたい場合はtrueを指定
   */
  sortStorageNodes(nodes: StorageNode[], desc: boolean = false): void {
    nodes.sort((a, b) => {
      // ソート用文字列(strA, strB)の説明:
      //   ノードがファイルの場合、同じ階層にあるディレクトリより順位を下げるために
      //   大きな文字コード"0xffff"を付加している。これにより同一階層のファイルと
      //   ディレクトリを比較した際、ファイルの方が文字的に大きいと判断され、下の方へ
      //   配置されることになる。

      let strA = a.path
      if (a.nodeType === StorageNodeType.File) {
        strA = `${a.dir}${String.fromCodePoint(0xffff)}${a.name}`
      }

      let strB = b.path
      if (b.nodeType === StorageNodeType.File) {
        strB = `${b.dir}${String.fromCodePoint(0xffff)}${b.name}`
      }

      if (strA < strB) {
        return desc ? 1 : -1
      } else if (strA > strB) {
        return desc ? -1 : 1
      } else {
        return 0
      }
    })
  }

  /**
   * ノード名からノードタイプを判別し、取得します。
   * @param nameOrPath
   */
  getStorageNodeType(nameOrPath: string): StorageNodeType {
    // ノード名の末尾が'/'の場合はディレクトリ、それ以外はファイルと判定
    return nameOrPath.match(/\/$/) ? StorageNodeType.Dir : StorageNodeType.File
  }

  /**
   * ユーザーディレクトリのパスを取得します。
   * @param user
   */
  getUserStorageDirPath(user: IdToken): string {
    return `users/${user.uid}`
  }

  /**
   * 親ディレクトリがない場合、仮想的にディレクトリを作成して穴埋めします。
   * このようなことを行う理由として、Cloud Storageは親ディレクトリが存在しないことがあるためです。
   * 例えば、"aaa/bbb/family.png"の場合、"aaa/bbb/"というディレクトリがない場合があります。
   * このように親ディレクトリがない場合、想的にディレクトリを作成して穴埋めします。
   *
   * `basePath`は基準パスで、このパスより上位のディレクトリは作成しません。
   * 例えば、"aaa/bbb/ccc/family.png"というノードがあり、ディレクトリが存在しないとします。
   * この条件で`basePath`に"aaa/bbb"を指定すると、以下のようにディレクトリノードが作成されます。
   * + "aaa" ← 作成されない
   * + "aaa/bbb" ← 作成される
   * + "aaa/bbb/ccc" ← 作成される
   *
   * @param nodeMap
   * @param basePath
   */
  padVirtualDirNode(nodeMap: { [path: string]: StorageNode }, basePath?: string): void {
    basePath = removeEndSlash(basePath)
    // 指定された全ノードの階層的なディレクトリパスを取得
    const dirPaths = Object.values(nodeMap).map(node => node.dir)
    const hierarchicalDirPaths = this.splitHierarchicalDirPaths(...dirPaths)

    // 親ディレクトリがない場合、仮想的にディレクトリを作成して穴埋めする
    for (const dirPath of hierarchicalDirPaths) {
      if (basePath && !dirPath.startsWith(basePath)) continue
      if (nodeMap[dirPath]) continue
      nodeMap[dirPath] = this.toDirStorageNode(dirPath)
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
    let set: Set<string> = new Set<string>()

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

/**
 * パス先頭のスラッシュを除去します。
 * @param nodePath
 */
export function removeStartSlash(nodePath?: string): string {
  if (!nodePath) return ''
  return nodePath.replace(/^\//, '')
}

/**
 * パス末尾のスラッシュを除去します。
 * @param nodePath
 */
export function removeEndSlash(nodePath?: string): string {
  if (!nodePath) return ''
  return nodePath.replace(/\/$/, '')
}

/**
 * ファイルパスをファイル名とディレクトリパスに分割します。
 * @param filePath
 */
export function splitFilePath(filePath: string): { fileName: string; dirPath: string } {
  const segments = filePath.split('/')
  const fileName = segments[segments.length - 1]
  let dirPath = ''
  if (segments.length >= 2) {
    dirPath = segments.slice(0, segments.length - 1).join('/')
  }
  return { fileName, dirPath }
}
