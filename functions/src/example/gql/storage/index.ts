import { AppStorageServiceDI, AppStorageServiceModule } from '../../services'
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import {
  AuthGuard,
  AuthGuardModule,
  AuthRoleType,
  GQLContext,
  GQLContextArg,
  IdToken,
  Roles,
  SignedUploadUrlInput,
  StorageNode,
  StorageNodeShareSettingsInput,
  StoragePaginationOptionsInput,
  StoragePaginationResult,
  UserArg,
} from '../../../lib'
import { Inject, UseGuards } from '@nestjs/common'
import { BaseGQLModule } from '../base'
import { Module } from '@nestjs/common'

//========================================================================
//
//  Implementation
//
//========================================================================

@Resolver('StorageNode')
export class StorageResolver {
  constructor(@Inject(AppStorageServiceDI.symbol) protected readonly storageService: AppStorageServiceDI.type) {}

  //--------------------------------------------------
  //  User
  //--------------------------------------------------

  @Query()
  @UseGuards(AuthGuard)
  async userStorageNode(@UserArg() user: IdToken, @Args('nodePath') nodePath: string): Promise<StorageNode | undefined> {
    return this.storageService.getUserNodeByPath(user, nodePath)
  }

  @Query()
  @UseGuards(AuthGuard)
  async userStorageDirDescendants(
    @UserArg() user: IdToken,
    @Args('dirPath') dirPath?: string,
    @Args('options') options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return this.storageService.getUserDirDescendants(user, dirPath, options)
  }

  @Query()
  @UseGuards(AuthGuard)
  async userStorageDescendants(
    @UserArg() user: IdToken,
    @Args('dirPath') dirPath?: string,
    @Args('options') options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return this.storageService.getUserDescendants(user, dirPath, options)
  }

  @Query()
  @UseGuards(AuthGuard)
  async userStorageDirChildren(
    @UserArg() user: IdToken,
    @Args('dirPath') dirPath?: string,
    @Args('options') options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return this.storageService.getUserDirChildren(user, dirPath, options)
  }

  @Query()
  @UseGuards(AuthGuard)
  async userStorageChildren(
    @UserArg() user: IdToken,
    @Args('dirPath') dirPath?: string,
    @Args('options') options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return this.storageService.getUserChildren(user, dirPath, options)
  }

  @Query()
  @UseGuards(AuthGuard)
  async userStorageHierarchicalNodes(@UserArg() user: IdToken, @Args('nodePath') nodePath: string): Promise<StorageNode[]> {
    return this.storageService.getUserHierarchicalNodes(user, nodePath)
  }

  @Query()
  @UseGuards(AuthGuard)
  async userStorageAncestorDirs(@UserArg() user: IdToken, @Args('nodePath') nodePath: string): Promise<StorageNode[]> {
    return this.storageService.getUserAncestorDirs(user, nodePath)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async handleUploadedUserFile(@UserArg() user: IdToken, @Args('filePath') filePath: string): Promise<StorageNode> {
    return await this.storageService.handleUploadedUserFile(user, filePath)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async createUserStorageDirs(@UserArg() user: IdToken, @Args('dirPaths') dirPaths: string[]): Promise<StorageNode[]> {
    return this.storageService.createUserDirs(user, dirPaths)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async removeUserStorageDir(
    @UserArg() user: IdToken,
    @Args('dirPath') dirPath: string,
    @Args('options') options: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return await this.storageService.removeUserDir(user, dirPath, options)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async removeUserStorageFile(@UserArg() user: IdToken, @Args('filePath') filePath: string): Promise<StorageNode | undefined> {
    return await this.storageService.removeUserFile(user, filePath)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async moveUserStorageDir(
    @UserArg() user: IdToken,
    @Args('fromDirPath') fromDirPath: string,
    @Args('toDirPath') toDirPath: string,
    @Args('options') options: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return await this.storageService.moveUserDir(user, fromDirPath, toDirPath, options)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async moveUserStorageFile(
    @UserArg() user: IdToken,
    @Args('fromFilePath') fromFilePath: string,
    @Args('toFilePath') toFilePath: string
  ): Promise<StorageNode> {
    return await this.storageService.moveUserFile(user, fromFilePath, toFilePath)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async renameUserStorageDir(
    @UserArg() user: IdToken,
    @Args('dirPath') dirPath: string,
    @Args('newName') newName: string,
    @Args('options') options: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return await this.storageService.renameUserDir(user, dirPath, newName, options)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async renameUserStorageFile(@UserArg() user: IdToken, @Args('filePath') filePath: string, @Args('newName') newName: string): Promise<StorageNode> {
    return await this.storageService.renameUserFile(user, filePath, newName)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async setUserStorageDirShareSettings(
    @UserArg() user: IdToken,
    @Args('dirPath') dirPath: string,
    @Args('settings') settings: StorageNodeShareSettingsInput
  ): Promise<StorageNode> {
    return this.storageService.setUserDirShareSettings(user, dirPath, settings)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async setUserStorageFileShareSettings(
    @UserArg() user: IdToken,
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
    return this.storageService.getNodeByPath(nodePath)
  }

  @Query()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async storageDirDescendants(
    @Args('dirPath') dirPath?: string,
    @Args('options') options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return this.storageService.getDirDescendants(dirPath, options)
  }

  @Query()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async storageDescendants(
    @Args('dirPath') dirPath?: string,
    @Args('options') options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return this.storageService.getDescendants(dirPath, options)
  }

  @Query()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async storageDirChildren(
    @Args('dirPath') dirPath?: string,
    @Args('options') options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return this.storageService.getDirChildren(dirPath, options)
  }

  @Query()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async storageChildren(
    @Args('dirPath') dirPath?: string,
    @Args('options') options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return this.storageService.getChildren(dirPath, options)
  }

  @Query()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async storageHierarchicalNodes(@Args('nodePath') nodePath: string): Promise<StorageNode[]> {
    return this.storageService.getHierarchicalNodes(nodePath)
  }

  @Query()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async storageAncestorDirs(@Args('nodePath') nodePath: string): Promise<StorageNode[]> {
    return this.storageService.getAncestorDirs(nodePath)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async handleUploadedFile(@Args('filePath') filePath: string): Promise<StorageNode> {
    return await this.storageService.handleUploadedFile(filePath)
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
  async removeStorageDir(
    @Args('dirPath') dirPath: string,
    @Args('options') options: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return await this.storageService.removeDir(dirPath, options)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async removeStorageFile(@Args('filePath') filePath: string): Promise<StorageNode | undefined> {
    return await this.storageService.removeFile(filePath)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async moveStorageDir(
    @Args('fromDirPath') fromDirPath: string,
    @Args('toDirPath') toDirPath: string,
    @Args('options') options: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return await this.storageService.moveDir(fromDirPath, toDirPath, options)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async moveStorageFile(@Args('fromFilePath') fromFilePath: string, @Args('toFilePath') toFilePath: string): Promise<StorageNode> {
    return await this.storageService.moveFile(fromFilePath, toFilePath)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async renameStorageDir(
    @Args('dirPath') dirPath: string,
    @Args('newName') newName: string,
    @Args('options') options: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return await this.storageService.renameDir(dirPath, newName, options)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async renameStorageFile(@Args('filePath') filePath: string, @Args('newName') newName: string): Promise<StorageNode> {
    return await this.storageService.renameFile(filePath, newName)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async setStorageDirShareSettings(
    @Args('dirPath') dirPath: string,
    @Args('settings') settings: StorageNodeShareSettingsInput
  ): Promise<StorageNode> {
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

  @Query()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async signedUploadUrls(@GQLContextArg() context: GQLContext, @Args('inputs') inputs: SignedUploadUrlInput[]): Promise<string[]> {
    const requestOrigin = (context.req.headers.origin as string) || ''
    return this.storageService.getSignedUploadUrls(requestOrigin, inputs)
  }
}

@Module({
  providers: [StorageResolver],
  imports: [BaseGQLModule, AppStorageServiceModule, AuthGuardModule],
})
class StorageGQLModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export default StorageGQLModule
