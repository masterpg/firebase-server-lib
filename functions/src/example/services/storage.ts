import * as admin from 'firebase-admin'
import * as path from 'path'
import * as shortid from 'shortid'
import { GCSStorageNode, IdToken, LibStorageService, LibStorageServiceDI, StorageNodeShareSettingsInput, StorageUser } from '../../lib'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { Request, Response } from 'express'
import { UserRecord } from 'firebase-functions/lib/providers/auth'
import { config } from '../../lib/base'

@Injectable()
export class StorageService extends LibStorageService {
  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

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

  async getHierarchicalUserDirDescendants(user: StorageUser, dirPath?: string): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.getHierarchicalDirDescendants(dirPath, userDirPath)
  }

  async getHierarchicalUserDirChildren(user: StorageUser, dirPath?: string): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.getHierarchicalDirChildren(dirPath, userDirPath)
  }

  async getUserDirChildren(user: StorageUser, dirPath?: string): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.getDirChildren(dirPath, userDirPath)
  }

  async createUserDirs(user: StorageUser, dirPaths: string[]): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.createDirs(dirPaths, userDirPath)
  }

  async handleUploadedUserFiles(user: StorageUser, filePaths: string[]): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.handleUploadedFiles(filePaths, userDirPath)
  }

  async removeUserDirs(user: StorageUser, dirPaths: string[]): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.removeDirs(dirPaths, userDirPath)
  }

  async removeUserFiles(user: StorageUser, filePaths: string[]): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.removeFiles(filePaths, userDirPath)
  }

  async moveUserDir(user: StorageUser, fromDirPath: string, toDirPath: string): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.moveDir(fromDirPath, toDirPath, userDirPath)
  }

  async moveUserFile(user: StorageUser, fromFilePath: string, toDirPath: string): Promise<GCSStorageNode> {
    const userDirPath = this.getUserDirPath(user)
    return this.moveFile(fromFilePath, toDirPath, userDirPath)
  }

  async renameUserDir(user: StorageUser, dirPath: string, newName: string): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.renameDir(dirPath, newName, userDirPath)
  }

  async renameUserFile(user: StorageUser, filePath: string, newName: string): Promise<GCSStorageNode> {
    const userDirPath = this.getUserDirPath(user)
    return this.renameFile(filePath, newName, userDirPath)
  }

  async setUserDirShareSettings(user: StorageUser, dirPath: string, settings: StorageNodeShareSettingsInput): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.setDirShareSettings(dirPath, settings, userDirPath)
  }

  async setUserFileShareSettings(user: StorageUser, filePath: string, settings: StorageNodeShareSettingsInput): Promise<GCSStorageNode> {
    const userDirPath = this.getUserDirPath(user)
    return this.setFileShareSettings(filePath, settings, userDirPath)
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

export namespace StorageServiceDI {
  export const symbol = LibStorageServiceDI.symbol
  export const provider = {
    provide: symbol,
    useClass: StorageService,
  }
  export type type = StorageService
}
