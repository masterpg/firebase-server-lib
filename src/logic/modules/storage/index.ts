import { StorageLogic, StorageNodeBag } from '@/logic'
import { StorageUploadManager, toStorageNodeBag } from '@/logic/modules/storage/base'
import { AdminStorageUploadManager } from '@/logic/modules/storage/admin-upload'
import { BaseLogic } from '@/logic/base'
import { Component } from 'vue-property-decorator'
import { UserStorageUploadManager } from '@/logic/modules/storage/user-upload'
import { config } from '@/base/config'
import { gql } from '@/gql'

@Component
export class StorageLogicImpl extends BaseLogic implements StorageLogic {
  toURL(path: string): string {
    path = path.replace(/^\//, '')
    return `${config.api.baseURL}/storage/${path}`
  }

  async getUserNodes(dirPath?: string): Promise<StorageNodeBag> {
    const gqlNodes = await gql.userStorageDirNodes(dirPath)
    return toStorageNodeBag(gqlNodes)
  }

  async createUserStorageDirs(dirPaths: string[]): Promise<StorageNodeBag> {
    const gqlNodes = await gql.createUserStorageDirs(dirPaths)
    return toStorageNodeBag(gqlNodes)
  }

  async removeUserStorageFiles(filePaths: string[]): Promise<StorageNodeBag> {
    const gqlNodes = await gql.removeUserStorageFiles(filePaths)
    return toStorageNodeBag(gqlNodes)
  }

  async removeUserStorageDir(dirPath: string): Promise<StorageNodeBag> {
    const gqlNodes = await gql.removeUserStorageDir(dirPath)
    return toStorageNodeBag(gqlNodes)
  }

  newUserUploadManager(owner: Element): StorageUploadManager {
    return new UserStorageUploadManager(owner)
  }

  newAdminUploadManager(owner: Element): StorageUploadManager {
    return new AdminStorageUploadManager(owner)
  }
}

export { StorageUploadManager }
