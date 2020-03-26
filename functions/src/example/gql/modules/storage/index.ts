import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import {
  AuthGuard,
  AuthRoleType,
  GQLContext,
  GQLCtx,
  GetStorageOptionsInput,
  GetStorageResult,
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

  //--------------------------------------------------
  //  User
  //--------------------------------------------------

  @Query()
  @UseGuards(AuthGuard)
  async userStorageNode(@User() user: IdToken, @Args('nodePath') nodePath: string): Promise<StorageNode | undefined> {
    return this.storageService.getUserNode(user, nodePath)
  }

  @Query()
  @UseGuards(AuthGuard)
  async userStorageDirDescendants(
    @User() user: IdToken,
    @Args('dirPath') dirPath?: string,
    @Args('options') options?: GetStorageOptionsInput
  ): Promise<GetStorageResult> {
    return this.storageService.getUserDirDescendants(user, dirPath, options)
  }

  @Query()
  @UseGuards(AuthGuard)
  async userStorageDescendants(
    @User() user: IdToken,
    @Args('dirPath') dirPath?: string,
    @Args('options') options?: GetStorageOptionsInput
  ): Promise<GetStorageResult> {
    return this.storageService.getUserDescendants(user, dirPath, options)
  }

  @Query()
  @UseGuards(AuthGuard)
  async userStorageDirChildren(
    @User() user: IdToken,
    @Args('dirPath') dirPath?: string,
    @Args('options') options?: GetStorageOptionsInput
  ): Promise<GetStorageResult> {
    return this.storageService.getUserDirChildren(user, dirPath, options)
  }

  @Query()
  @UseGuards(AuthGuard)
  async userStorageChildren(
    @User() user: IdToken,
    @Args('dirPath') dirPath?: string,
    @Args('options') options?: GetStorageOptionsInput
  ): Promise<GetStorageResult> {
    return this.storageService.getUserChildren(user, dirPath, options)
  }

  @Query()
  @UseGuards(AuthGuard)
  async userStorageHierarchicalNode(@User() user: IdToken, @Args('nodePath') nodePath: string): Promise<StorageNode[]> {
    return this.storageService.getUserHierarchicalNode(user, nodePath)
  }

  @Query()
  @UseGuards(AuthGuard)
  async userStorageAncestorDirs(@User() user: IdToken, @Args('nodePath') nodePath: string): Promise<StorageNode[]> {
    return this.storageService.getUserAncestorDirs(user, nodePath)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async handleUploadedUserFiles(@User() user: IdToken, @Args('filePaths') filePaths: string[]): Promise<boolean> {
    await this.storageService.handleUploadedUserFiles(user, filePaths)
    return true
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async createUserStorageDirs(@User() user: IdToken, @Args('dirPaths') dirPaths: string[]): Promise<StorageNode[]> {
    return this.storageService.createUserDirs(user, dirPaths)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async removeUserStorageDirs(@User() user: IdToken, @Args('dirPaths') dirPaths: string[]): Promise<boolean> {
    await this.storageService.removeUserDirs(user, dirPaths)
    return true
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async removeUserStorageFiles(@User() user: IdToken, @Args('filePaths') filePaths: string[]): Promise<boolean> {
    await this.storageService.removeUserFiles(user, filePaths)
    return true
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async moveUserStorageDir(@User() user: IdToken, @Args('fromDirPath') fromDirPath: string, @Args('toDirPath') toDirPath: string): Promise<boolean> {
    await this.storageService.moveUserDir(user, fromDirPath, toDirPath)
    return true
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async moveUserStorageFile(
    @User() user: IdToken,
    @Args('fromFilePath') fromFilePath: string,
    @Args('toFilePath') toFilePath: string
  ): Promise<boolean> {
    await this.storageService.moveUserFile(user, fromFilePath, toFilePath)
    return true
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async renameUserStorageDir(@User() user: IdToken, @Args('dirPath') dirPath: string, @Args('newName') newName: string): Promise<boolean> {
    await this.storageService.renameUserDir(user, dirPath, newName)
    return true
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async renameUserStorageFile(@User() user: IdToken, @Args('filePath') filePath: string, @Args('newName') newName: string): Promise<boolean> {
    await this.storageService.renameUserFile(user, filePath, newName)
    return true
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async setUserStorageDirShareSettings(
    @User() user: IdToken,
    @Args('dirPath') dirPath: string,
    @Args('settings') settings: StorageNodeShareSettingsInput
  ): Promise<StorageNode> {
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

  //--------------------------------------------------
  //  Application
  //--------------------------------------------------

  @Query()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async storageNode(@Args('nodePath') nodePath: string): Promise<StorageNode | undefined> {
    return this.storageService.getNode(null, nodePath)
  }

  @Query()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async storageDirDescendants(@Args('dirPath') dirPath?: string, @Args('options') options?: GetStorageOptionsInput): Promise<GetStorageResult> {
    return this.storageService.getDirDescendants(null, dirPath, options)
  }

  @Query()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async storageDescendants(@Args('dirPath') dirPath?: string, @Args('options') options?: GetStorageOptionsInput): Promise<GetStorageResult> {
    return this.storageService.getDescendants(null, dirPath, options)
  }

  @Query()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async storageDirChildren(@Args('dirPath') dirPath?: string, @Args('options') options?: GetStorageOptionsInput): Promise<GetStorageResult> {
    return this.storageService.getDirChildren(null, dirPath, options)
  }

  @Query()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async storageChildren(@Args('dirPath') dirPath?: string, @Args('options') options?: GetStorageOptionsInput): Promise<GetStorageResult> {
    return this.storageService.getChildren(null, dirPath, options)
  }

  @Query()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async storageHierarchicalNode(@Args('nodePath') nodePath: string): Promise<StorageNode[]> {
    return this.storageService.getHierarchicalNode(null, nodePath)
  }

  @Query()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async storageAncestorDirs(@Args('nodePath') nodePath: string): Promise<StorageNode[]> {
    return this.storageService.getAncestorDirs(null, nodePath)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async handleUploadedFiles(@Args('filePaths') filePaths: string[]): Promise<boolean> {
    await this.storageService.handleUploadedFiles(null, filePaths)
    return true
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async createStorageDirs(@Args('dirPaths') dirPaths: string[]): Promise<StorageNode[]> {
    return this.storageService.createDirs(null, dirPaths)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async removeStorageDirs(@Args('dirPaths') dirPaths: string[]): Promise<boolean> {
    await this.storageService.removeDirs(null, dirPaths)
    return true
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async removeStorageFiles(@Args('filePaths') filePaths: string[]): Promise<boolean> {
    await this.storageService.removeFiles(null, filePaths)
    return true
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async moveStorageDir(@Args('fromDirPath') fromDirPath: string, @Args('toDirPath') toDirPath: string): Promise<boolean> {
    await this.storageService.moveDir(null, fromDirPath, toDirPath)
    return true
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async moveStorageFile(@Args('fromFilePath') fromFilePath: string, @Args('toFilePath') toFilePath: string): Promise<boolean> {
    await this.storageService.moveFile(null, fromFilePath, toFilePath)
    return true
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async renameStorageDir(@Args('dirPath') dirPath: string, @Args('newName') newName: string): Promise<boolean> {
    await this.storageService.renameDir(null, dirPath, newName)
    return true
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async renameStorageFile(@Args('filePath') filePath: string, @Args('newName') newName: string): Promise<boolean> {
    await this.storageService.renameFile(null, filePath, newName)
    return true
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async setStorageDirShareSettings(
    @Args('dirPath') dirPath: string,
    @Args('settings') settings: StorageNodeShareSettingsInput
  ): Promise<StorageNode> {
    return this.storageService.setDirShareSettings(null, dirPath, settings)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async setStorageFileShareSettings(
    @Args('filePath') filePath: string,
    @Args('settings') settings: StorageNodeShareSettingsInput
  ): Promise<StorageNode> {
    return this.storageService.setFileShareSettings(null, filePath, settings)
  }

  @Query()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async signedUploadUrls(@GQLCtx() context: GQLContext, @Args('inputs') inputs: SignedUploadUrlInput[]): Promise<string[]> {
    const requestOrigin = (context.req.headers.origin as string) || ''
    return this.storageService.getSignedUploadUrls(requestOrigin, inputs)
  }
}

@Module({
  providers: [StorageResolver],
})
export class GQLStorageModule {}
