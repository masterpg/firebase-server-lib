import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import {
  AuthGuard,
  AuthRoleType,
  GQLContext,
  GQLCtx,
  IdToken,
  Roles,
  SignedUploadUrlInput,
  StorageNode,
  StorageNodeShareSettingsInput,
  User,
} from '../../../../lib'
import { Inject, UseGuards } from '@nestjs/common'
import { Module } from '@nestjs/common'
import { StorageServiceDI } from '../../../services'

@Resolver('StorageNode')
export class StorageResolver {
  constructor(@Inject(StorageServiceDI.symbol) protected readonly storageService: StorageServiceDI.type) {}

  @Query()
  @UseGuards(AuthGuard)
  async userStorageDirNodes(@User() user: IdToken, @Args('dirPath') dirPath?: string): Promise<StorageNode[]> {
    return this.storageService.getUserDirNodes(user, dirPath)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async createUserStorageDirs(@User() user: IdToken, @Args('dirPaths') dirPaths: string[]): Promise<StorageNode[]> {
    return this.storageService.createUserDirs(user, dirPaths)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async removeUserStorageDirs(@User() user: IdToken, @Args('dirPaths') dirPaths: string[]): Promise<StorageNode[]> {
    return this.storageService.removeUserDirs(user, dirPaths)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async removeUserStorageFiles(@User() user: IdToken, @Args('filePaths') filePaths: string[]): Promise<StorageNode[]> {
    return this.storageService.removeUserFiles(user, filePaths)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async moveUserStorageDir(
    @User() user: IdToken,
    @Args('fromDirPath') fromDirPath: string,
    @Args('toDirPath') toDirPath: string
  ): Promise<StorageNode[]> {
    return this.storageService.moveUserDir(user, fromDirPath, toDirPath)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async moveUserStorageFile(
    @User() user: IdToken,
    @Args('fromFilePath') fromFilePath: string,
    @Args('toFilePath') toFilePath: string
  ): Promise<StorageNode> {
    return this.storageService.moveUserFile(user, fromFilePath, toFilePath)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async renameUserStorageDir(@User() user: IdToken, @Args('dirPath') dirPath: string, @Args('newName') newName: string): Promise<StorageNode[]> {
    return this.storageService.renameUserDir(user, dirPath, newName)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async renameUserStorageFile(@User() user: IdToken, @Args('filePath') filePath: string, @Args('newName') newName: string): Promise<StorageNode> {
    return this.storageService.renameUserFile(user, filePath, newName)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async setUserStorageDirShareSettings(
    @User() user: IdToken,
    @Args('dirPath') dirPath: string,
    @Args('settings') settings: StorageNodeShareSettingsInput
  ): Promise<StorageNode[]> {
    return this.storageService.setUserDirShareSettings(user, dirPath, settings)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async setUserStorageFileShareSettings(
    @User() user: IdToken,
    @Args('filePath') filePath: string,
    @Args('settings') settings: StorageNodeShareSettingsInput
  ): Promise<StorageNode> {
    return this.storageService.setUserFileShareSettings(user, filePath, settings)
  }

  @Query()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async signedUploadUrls(@GQLCtx() context: GQLContext, @Args('inputs') inputs: SignedUploadUrlInput[]): Promise<string[]> {
    const requestOrigin = (context.req.headers.origin as string) || ''
    return this.storageService.getSignedUploadUrls(requestOrigin, inputs)
  }

  @Query()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async storageDirNodes(@Args('dirPath') dirPath?: string): Promise<StorageNode[]> {
    return this.storageService.getDirNodes(dirPath)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async createStorageDirs(@Args('dirPaths') dirPaths: string[]): Promise<StorageNode[]> {
    return this.storageService.createDirs(dirPaths)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async removeStorageDirs(@Args('dirPaths') dirPaths: string[]): Promise<StorageNode[]> {
    return this.storageService.removeDirs(dirPaths)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async removeStorageFiles(@Args('filePaths') filePaths: string[]): Promise<StorageNode[]> {
    return this.storageService.removeFiles(filePaths)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async moveStorageDir(@Args('fromDirPath') fromDirPath: string, @Args('toDirPath') toDirPath: string): Promise<StorageNode[]> {
    return this.storageService.moveDir(fromDirPath, toDirPath)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async moveStorageFile(@Args('fromFilePath') fromFilePath: string, @Args('toFilePath') toFilePath: string): Promise<StorageNode> {
    return this.storageService.moveFile(fromFilePath, toFilePath)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async renameStorageDir(@Args('dirPath') dirPath: string, @Args('newName') newName: string): Promise<StorageNode[]> {
    return this.storageService.renameDir(dirPath, newName)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async renameStorageFile(@Args('filePath') filePath: string, @Args('newName') newName: string): Promise<StorageNode> {
    return this.storageService.renameFile(filePath, newName)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async setStorageDirShareSettings(
    @Args('dirPath') dirPath: string,
    @Args('settings') settings: StorageNodeShareSettingsInput
  ): Promise<StorageNode[]> {
    return this.storageService.setDirShareSettings(dirPath, settings)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async setStorageFileShareSettings(
    @Args('filePath') filePath: string,
    @Args('settings') settings: StorageNodeShareSettingsInput
  ): Promise<StorageNode> {
    return this.storageService.setFileShareSettings(filePath, settings)
  }
}

@Module({
  providers: [StorageResolver],
})
export class GQLStorageModule {}
