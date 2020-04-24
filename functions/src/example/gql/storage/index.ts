import * as path from 'path'
import { Args, GraphQLModule, Mutation, Query, Resolver } from '@nestjs/graphql'
import {
  AuthGuard,
  AuthGuardModule,
  AuthRoleType,
  GQLContext,
  GQLCtx,
  IdToken,
  Roles,
  SignedUploadUrlInput,
  StorageNode,
  StorageNodeShareSettingsInput,
  StoragePaginationOptionsInput,
  StoragePaginationResult,
  User,
} from '../../../lib'
import { BaseGQLModule, getGQLModuleOptions } from '../base'
import { Inject, UseGuards } from '@nestjs/common'
import { StorageServiceDI, StorageServiceModule } from '../../services'
import { Module } from '@nestjs/common'
import { config } from '../../../config'

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
    @Args('options') options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return this.storageService.getUserDirDescendants(user, dirPath, options)
  }

  @Query()
  @UseGuards(AuthGuard)
  async userStorageDescendants(
    @User() user: IdToken,
    @Args('dirPath') dirPath?: string,
    @Args('options') options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return this.storageService.getUserDescendants(user, dirPath, options)
  }

  @Query()
  @UseGuards(AuthGuard)
  async userStorageDirChildren(
    @User() user: IdToken,
    @Args('dirPath') dirPath?: string,
    @Args('options') options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return this.storageService.getUserDirChildren(user, dirPath, options)
  }

  @Query()
  @UseGuards(AuthGuard)
  async userStorageChildren(
    @User() user: IdToken,
    @Args('dirPath') dirPath?: string,
    @Args('options') options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return this.storageService.getUserChildren(user, dirPath, options)
  }

  @Query()
  @UseGuards(AuthGuard)
  async userStorageHierarchicalNodes(@User() user: IdToken, @Args('nodePath') nodePath: string): Promise<StorageNode[]> {
    return this.storageService.getUserHierarchicalNode(user, nodePath)
  }

  @Query()
  @UseGuards(AuthGuard)
  async userStorageAncestorDirs(@User() user: IdToken, @Args('nodePath') nodePath: string): Promise<StorageNode[]> {
    return this.storageService.getUserAncestorDirs(user, nodePath)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async handleUploadedUserFile(@User() user: IdToken, @Args('filePath') filePath: string): Promise<StorageNode> {
    return await this.storageService.handleUploadedUserFile(user, filePath)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async createUserStorageDirs(@User() user: IdToken, @Args('dirPaths') dirPaths: string[]): Promise<StorageNode[]> {
    return this.storageService.createUserDirs(user, dirPaths)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async removeUserStorageDir(
    @User() user: IdToken,
    @Args('dirPath') dirPath: string,
    @Args('options') options: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return await this.storageService.removeUserDir(user, dirPath, options)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async removeUserStorageFile(@User() user: IdToken, @Args('filePath') filePath: string): Promise<StorageNode | undefined> {
    return await this.storageService.removeUserFile(user, filePath)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async moveUserStorageDir(
    @User() user: IdToken,
    @Args('fromDirPath') fromDirPath: string,
    @Args('toDirPath') toDirPath: string,
    @Args('options') options: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return await this.storageService.moveUserDir(user, fromDirPath, toDirPath, options)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async moveUserStorageFile(
    @User() user: IdToken,
    @Args('fromFilePath') fromFilePath: string,
    @Args('toFilePath') toFilePath: string
  ): Promise<StorageNode> {
    return await this.storageService.moveUserFile(user, fromFilePath, toFilePath)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async renameUserStorageDir(
    @User() user: IdToken,
    @Args('dirPath') dirPath: string,
    @Args('newName') newName: string,
    @Args('options') options: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return await this.storageService.renameUserDir(user, dirPath, newName, options)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async renameUserStorageFile(@User() user: IdToken, @Args('filePath') filePath: string, @Args('newName') newName: string): Promise<StorageNode> {
    return await this.storageService.renameUserFile(user, filePath, newName)
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
  async storageDirDescendants(
    @Args('dirPath') dirPath?: string,
    @Args('options') options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return this.storageService.getDirDescendants(null, dirPath, options)
  }

  @Query()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async storageDescendants(
    @Args('dirPath') dirPath?: string,
    @Args('options') options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return this.storageService.getDescendants(null, dirPath, options)
  }

  @Query()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async storageDirChildren(
    @Args('dirPath') dirPath?: string,
    @Args('options') options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return this.storageService.getDirChildren(null, dirPath, options)
  }

  @Query()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async storageChildren(
    @Args('dirPath') dirPath?: string,
    @Args('options') options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return this.storageService.getChildren(null, dirPath, options)
  }

  @Query()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async storageHierarchicalNodes(@Args('nodePath') nodePath: string): Promise<StorageNode[]> {
    return this.storageService.getHierarchicalNodes(null, nodePath)
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
  async handleUploadedFile(@Args('filePath') filePath: string): Promise<StorageNode> {
    return await this.storageService.handleUploadedFile(null, filePath)
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
  async removeStorageDir(
    @Args('dirPath') dirPath: string,
    @Args('options') options: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return await this.storageService.removeDir(null, dirPath, options)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async removeStorageFile(@Args('filePath') filePath: string): Promise<StorageNode | undefined> {
    return await this.storageService.removeFile(null, filePath)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async moveStorageDir(
    @Args('fromDirPath') fromDirPath: string,
    @Args('toDirPath') toDirPath: string,
    @Args('options') options: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return await this.storageService.moveDir(null, fromDirPath, toDirPath, options)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async moveStorageFile(@Args('fromFilePath') fromFilePath: string, @Args('toFilePath') toFilePath: string): Promise<StorageNode> {
    return await this.storageService.moveFile(null, fromFilePath, toFilePath)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async renameStorageDir(
    @Args('dirPath') dirPath: string,
    @Args('newName') newName: string,
    @Args('options') options: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    return await this.storageService.renameDir(null, dirPath, newName, options)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async renameStorageFile(@Args('filePath') filePath: string, @Args('newName') newName: string): Promise<StorageNode> {
    return await this.storageService.renameFile(null, filePath, newName)
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

const schemaFile = `${path.join(config.gql.schema.moduleDir, 'storage/storage.graphql')}`

@Module({
  providers: [StorageResolver],
  imports: [BaseGQLModule, GraphQLModule.forRoot(getGQLModuleOptions([schemaFile])), StorageServiceModule, AuthGuardModule],
})
export default class StorageGQLModule {}
