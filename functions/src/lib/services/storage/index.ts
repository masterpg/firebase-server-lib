import * as admin from 'firebase-admin'
import * as path from 'path'
import * as shortid from 'shortid'
import { AuthServiceModule, UserIdClaims } from '../../nest'
import { BaseStorageService, GCSStorageNode, StorageNodeShareSettingsInput, StoragePaginationOptionsInput, StoragePaginationResult } from './base'
import { Injectable, Module, UnauthorizedException } from '@nestjs/common'
import { Request, Response } from 'express'
import { config } from '../../../config'
import { removeBothEndsSlash } from 'web-base-lib'

//========================================================================
//
//  Implementation
//
//========================================================================

@Injectable()
class StorageService extends BaseStorageService {
  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  /**
   * Cloud Storageのユーザーディレクトリの名前を割り当てます。
   * @param user
   */
  async assignUserDir(user: UserIdClaims): Promise<string> {
    let myDirName = user.myDirName
    const uid = user.uid

    // まだユーザーディレクトリ名が割り当てられていない場合
    if (!myDirName) {
      // カスタムクレームに'myDirName'というプロパティを追加。
      // このプロパティの値がユーザーディレクトリ名となる。
      myDirName = shortid.generate()
      await admin.auth().setCustomUserClaims(uid, {
        isAppAdmin: user.isAppAdmin,
        myDirName,
      })
    }

    // ユーザーディレクトリの作成(存在しない場合のみ)
    const userDirPath = this.getUserDirPath({ uid, myDirName })
    const userDirNode = await this.getRealDirNode(null, userDirPath)
    if (!userDirNode.exists) {
      await this.createDirs(null, [userDirNode.path])
    }

    return myDirName
  }

  /**
   * Cloud Storageのユーザーディレクトリのパスを取得します。
   * @param user
   */
  getUserDirPath(user: UserIdClaims): string {
    const myDirName = user.myDirName
    if (myDirName) {
      const usersDir = config.storage.usersDir
      return path.join(usersDir, myDirName)
    }
    throw new Error(`User [uid: '${user.uid}'] does not have a storage directory assigned.`)
  }

  /**
   * クライアントから指定されたアプリケーションファイルをレスポンスします。
   * @param req
   * @param res
   * @param filePath
   */
  async serveAppFile(req: Request, res: Response, filePath: string): Promise<Response> {
    filePath = removeBothEndsSlash(filePath)

    // 引数のファイルノードを取得
    const fileNode = await this.getRealFileNode(null, filePath)
    if (!fileNode.exists) {
      return res.sendStatus(404)
    }

    // ファイルの共有設定を取得
    const hierarchicalNodes = await this.getHierarchicalFileNodes(null, fileNode)
    const share = this.getInheritedShareSettings(hierarchicalNodes)

    // ファイルの公開フラグがオンの場合
    if (share.isPublic) {
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

    // ファイルの読み込み権限に自ユーザーが含まれている場合
    if (share.readUIds && share.readUIds.includes(user.uid)) {
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
    filePath = removeBothEndsSlash(filePath)

    // 引数のファイルノードを取得
    const fileNode = await this.getRealFileNode(null, filePath)
    if (!fileNode.exists) {
      return res.sendStatus(404)
    }

    // ファイルの共有設定を取得
    const hierarchicalNodes = await this.getHierarchicalFileNodes(null, fileNode)
    const share = this.getInheritedShareSettings(hierarchicalNodes)

    // ファイルの公開フラグがオンの場合
    if (share.isPublic) {
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

    // ファイルの読み込み権限に自ユーザーが含まれている場合
    if (share.readUIds && share.readUIds.includes(user.uid)) {
      return this.serveFile(req, res, fileNode)
    }

    return res.sendStatus(403)
  }

  async getUserNode(user: UserIdClaims, nodePath: string): Promise<GCSStorageNode | undefined> {
    const userDirPath = this.getUserDirPath(user)
    return this.getNode(userDirPath, nodePath)
  }

  async getUserDirDescendants(user: UserIdClaims, dirPath?: string, options?: StoragePaginationOptionsInput): Promise<StoragePaginationResult> {
    const userDirPath = this.getUserDirPath(user)
    return this.getDirDescendants(userDirPath, dirPath, options)
  }

  async getUserDescendants(user: UserIdClaims, dirPath?: string, options?: StoragePaginationOptionsInput): Promise<StoragePaginationResult> {
    const userDirPath = this.getUserDirPath(user)
    return this.getDescendants(userDirPath, dirPath, options)
  }

  async getUserDirChildren(user: UserIdClaims, dirPath?: string, options?: StoragePaginationOptionsInput): Promise<StoragePaginationResult> {
    const userDirPath = this.getUserDirPath(user)
    return this.getDirChildren(userDirPath, dirPath, options)
  }

  async getUserChildren(user: UserIdClaims, dirPath?: string, options?: StoragePaginationOptionsInput): Promise<StoragePaginationResult> {
    const userDirPath = this.getUserDirPath(user)
    return this.getChildren(userDirPath, dirPath, options)
  }

  async getUserHierarchicalNode(user: UserIdClaims, nodePath: string): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.getHierarchicalNodes(userDirPath, nodePath)
  }

  async getUserAncestorDirs(user: UserIdClaims, nodePath: string): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.getAncestorDirs(userDirPath, nodePath)
  }

  async createUserDirs(user: UserIdClaims, dirPaths: string[]): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.createDirs(userDirPath, dirPaths)
  }

  async handleUploadedUserFile(user: UserIdClaims, filePath: string): Promise<GCSStorageNode> {
    const userDirPath = this.getUserDirPath(user)
    return await this.handleUploadedFile(userDirPath, filePath)
  }

  async removeUserDir(user: UserIdClaims, dirPath: string, options?: StoragePaginationOptionsInput): Promise<StoragePaginationResult> {
    const userDirPath = this.getUserDirPath(user)
    return await this.removeDir(userDirPath, dirPath, options)
  }

  async removeUserFile(user: UserIdClaims, filePath: string): Promise<GCSStorageNode | undefined> {
    const userDirPath = this.getUserDirPath(user)
    return await this.removeFile(userDirPath, filePath)
  }

  async moveUserDir(
    user: UserIdClaims,
    fromDirPath: string,
    toDirPath: string,
    options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    const userDirPath = this.getUserDirPath(user)
    return await this.moveDir(userDirPath, fromDirPath, toDirPath, options)
  }

  async moveUserFile(user: UserIdClaims, fromFilePath: string, toDirPath: string): Promise<GCSStorageNode> {
    const userDirPath = this.getUserDirPath(user)
    return await this.moveFile(userDirPath, fromFilePath, toDirPath)
  }

  async renameUserDir(
    user: UserIdClaims,
    dirPath: string,
    newName: string,
    options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    const userDirPath = this.getUserDirPath(user)
    return await this.renameDir(userDirPath, dirPath, newName, options)
  }

  async renameUserFile(user: UserIdClaims, filePath: string, newName: string): Promise<GCSStorageNode> {
    const userDirPath = this.getUserDirPath(user)
    return await this.renameFile(userDirPath, filePath, newName)
  }

  async setUserDirShareSettings(user: UserIdClaims, dirPath: string, settings: StorageNodeShareSettingsInput): Promise<GCSStorageNode> {
    const userDirPath = this.getUserDirPath(user)
    return this.setDirShareSettings(userDirPath, dirPath, settings)
  }

  async setUserFileShareSettings(user: UserIdClaims, filePath: string, settings: StorageNodeShareSettingsInput): Promise<GCSStorageNode> {
    const userDirPath = this.getUserDirPath(user)
    return this.setFileShareSettings(userDirPath, filePath, settings)
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
  imports: [AuthServiceModule],
})
class StorageServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export {
  GCSStorageNode,
  SignedUploadUrlInput,
  StorageNode,
  StorageNodeShareSettings,
  StorageNodeShareSettingsInput,
  StorageNodeType,
  StoragePaginationOptionsInput,
  StoragePaginationResult,
  StorageUploadDataItem,
} from './base'
export { StorageService, StorageServiceDI, StorageServiceModule }
