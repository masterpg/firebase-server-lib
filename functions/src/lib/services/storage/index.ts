import * as admin from 'firebase-admin'
import * as path from 'path'
import * as shortid from 'shortid'
import { GCSStorageNode, StorageNodeShareSettingsInput, StorageUser } from './types'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { Request, Response } from 'express'
import { BaseStorageService } from './base'
import { IdToken } from '../../nest'
import { UserRecord } from 'firebase-functions/lib/providers/auth'
import { config } from '../../../config'

@Injectable()
export class LibStorageService extends BaseStorageService {
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
    const userDirNode = await this.getDirNode(null, userDirPath)
    if (!userDirNode.exists) {
      await this.createDirs(null, [userDirNode.path])
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
    const fileNode = await this.getFileNode(null, filePath)

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
    const fileNode = await this.getFileNode(null, filePath)

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

  async getHierarchicalUserDescendants(user: StorageUser, dirPath?: string): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.getHierarchicalDescendants(userDirPath, dirPath)
  }

  async getHierarchicalUserChildren(user: StorageUser, dirPath?: string): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.getHierarchicalChildren(userDirPath, dirPath)
  }

  async getUserChildren(user: StorageUser, dirPath?: string): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.getChildren(userDirPath, dirPath)
  }

  async createUserDirs(user: StorageUser, dirPaths: string[]): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.createDirs(userDirPath, dirPaths)
  }

  async handleUploadedUserFiles(user: StorageUser, filePaths: string[]): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.handleUploadedFiles(userDirPath, filePaths)
  }

  async removeUserDirs(user: StorageUser, dirPaths: string[]): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.removeDirs(userDirPath, dirPaths)
  }

  async removeUserFiles(user: StorageUser, filePaths: string[]): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.removeFiles(userDirPath, filePaths)
  }

  async moveUserDir(user: StorageUser, fromDirPath: string, toDirPath: string): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.moveDir(userDirPath, fromDirPath, toDirPath)
  }

  async moveUserFile(user: StorageUser, fromFilePath: string, toDirPath: string): Promise<GCSStorageNode> {
    const userDirPath = this.getUserDirPath(user)
    return this.moveFile(userDirPath, fromFilePath, toDirPath)
  }

  async renameUserDir(user: StorageUser, dirPath: string, newName: string): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.renameDir(userDirPath, dirPath, newName)
  }

  async renameUserFile(user: StorageUser, filePath: string, newName: string): Promise<GCSStorageNode> {
    const userDirPath = this.getUserDirPath(user)
    return this.renameFile(userDirPath, filePath, newName)
  }

  async setUserDirShareSettings(user: StorageUser, dirPath: string, settings: StorageNodeShareSettingsInput): Promise<GCSStorageNode[]> {
    const userDirPath = this.getUserDirPath(user)
    return this.setDirShareSettings(userDirPath, dirPath, settings)
  }

  async setUserFileShareSettings(user: StorageUser, filePath: string, settings: StorageNodeShareSettingsInput): Promise<GCSStorageNode> {
    const userDirPath = this.getUserDirPath(user)
    return this.setFileShareSettings(userDirPath, filePath, settings)
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

export * from './types'

export namespace LibStorageServiceDI {
  export const symbol = Symbol(LibStorageService.name)
  export const provider = {
    provide: symbol,
    useClass: LibStorageService,
  }
  export type type = LibStorageService
}
