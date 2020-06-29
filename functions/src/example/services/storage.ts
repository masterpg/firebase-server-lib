import * as admin from 'firebase-admin'
import * as path from 'path'
import { AppStoreServiceDI, AppStoreServiceModule } from './store'
import { AuthRoleType, AuthServiceDI, AuthServiceModule, IdToken, StorageService } from '../../lib'
import { ForbiddenException, Inject, Module } from '@nestjs/common'
import { Request, Response } from 'express'
import { config } from '../../config'

//========================================================================
//
//  Interfaces
//
//========================================================================

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

class AppStorageService extends StorageService {
  constructor(
    @Inject(AuthServiceDI.symbol) protected readonly authService: AuthServiceDI.type,
    @Inject(AppStoreServiceDI.symbol) protected readonly storeService: AppStoreServiceDI.type
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
  getUserDirPath(user: { uid: string }): string {
    return path.join(config.storage.usersDir, user.uid)
  }

  /**
   * 指定されたノードパスへリクエストユーザーがアクセス可能か検証します。
   * @param req
   * @param res
   * @param target
   */
  async validateAccessible(req: Request, res: Response, target: ValidateAccessibleTarget): Promise<IdToken> {
    const nodePaths = await this.toNodePaths(target)
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
      const needIsAppAdmin = nodePaths.some(nodePath => !this.isUserNode(nodePath))
      needIsAppAdmin && roles.push(AuthRoleType.AppAdmin)
    }

    // ユーザーノードパスへアクセス可能か検証
    if (!idToken.isAppAdmin) {
      for (const nodePath of nodePaths) {
        if (!this.isUserNode(nodePath)) continue
        // 指定ノードが自ユーザーの所有物でない場合
        const userDirPath = this.getUserDirPath({ uid: idToken.uid })
        const isOwnUserNode = nodePath == userDirPath || nodePath.startsWith(`${userDirPath}/`)
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
    if (this.isUserNode(fileNode.path)) {
      // 指定ファイルが自ユーザーの所有物である場合
      const userDirPath = this.getUserDirPath(user)
      if (fileNode.path.startsWith(path.join(userDirPath, '/'))) {
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
  async deleteUserDir(uid: string, maxChunk = AppStorageService.MAX_CHUNK): Promise<void> {
    /**
     * 指定されたディレクトリのストレージファイルを削除します。
     * @param userDirPath
     * @param pageToken
     */
    const deleteFiles = async (userDirPath: string, pageToken?: string) => {
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
      if (nextPageToken) await deleteFiles(userDirPath, nextPageToken)
    }

    /**
     * 指定されたディレクトリのストアノードを削除します。
     * @param userDirPath
     */
    const deleteFileNodes = async (userDirPath: string) => {
      // ユーザーディレクトリと配下ノードを検索
      const nodes = await this.storeService.storageDao.where('path', '>=', userDirPath).limit(maxChunk).fetch()
      // 余分に検索されてしまったノードを除去
      for (let i = 0; i < nodes.length; i++) {
        const storeNode = nodes[i]
        // ノードが「ユーザーディレクトリまたはユーザーディレクトリ配下」以外の場合は除去
        if (!(storeNode.path === userDirPath || storeNode.path.startsWith(`${userDirPath}/`))) {
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
      if (nodes.length > 0) await deleteFileNodes(userDirPath)
    }

    const userDirPath = this.getUserDirPath({ uid })
    await deleteFiles(userDirPath)
    await deleteFileNodes(userDirPath)
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  /**
   * `validateAccessible()`引数で指定される`target`にはノードIDとノードパスが含まれます。
   * このノードIDをノードパスに変換し、全てをノードパスとして返します。
   * @param target
   */
  protected async toNodePaths(target: ValidateAccessibleTarget): Promise<string[]> {
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
  isUserNode(nodePath: string): boolean {
    return nodePath.startsWith(`${config.storage.usersDir}/`)
  }
}

namespace AppStorageServiceDI {
  export const symbol = Symbol(AppStorageService.name)
  export const provider = {
    provide: symbol,
    useClass: AppStorageService,
  }
  export type type = AppStorageService
}

@Module({
  providers: [AppStorageServiceDI.provider],
  exports: [AppStorageServiceDI.provider],
  imports: [AuthServiceModule, AppStoreServiceModule],
})
class AppStorageServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { AppStorageServiceDI, AppStorageServiceModule }
