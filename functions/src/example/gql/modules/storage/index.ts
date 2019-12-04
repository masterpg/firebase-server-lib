import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import { AuthRoleType, GQLContext, GQLCtx, IdToken, Roles, SignedUploadUrlInput, StorageNode, User, UserGuard } from '../../../../lib'
import { Inject, UseGuards } from '@nestjs/common'
import { Module } from '@nestjs/common'
import { StorageServiceDI } from '../../../services'

@Resolver('StorageNode')
export class StorageResolver {
  constructor(@Inject(StorageServiceDI.symbol) protected readonly storageService: StorageServiceDI.type) {}

  @Query()
  @UseGuards(UserGuard)
  async userStorageDirNodes(@User() user: IdToken, @Args('dirPath') dirPath?: string): Promise<StorageNode[]> {
    return this.storageService.getUserStorageDirNodes(user, dirPath)
  }

  @Mutation()
  @UseGuards(UserGuard)
  async createUserStorageDirs(@User() user: IdToken, @Args('dirPaths') dirPaths: string[]): Promise<StorageNode[]> {
    return this.storageService.createUserStorageDirs(user, dirPaths)
  }

  @Mutation()
  @UseGuards(UserGuard)
  async removeUserStorageDirs(@User() user: IdToken, @Args('dirPaths') dirPaths: string[]): Promise<StorageNode[]> {
    return this.storageService.removeUserStorageDirs(user, dirPaths)
  }

  @Mutation()
  @UseGuards(UserGuard)
  async removeUserStorageFiles(@User() user: IdToken, @Args('filePaths') filePaths: string[]): Promise<StorageNode[]> {
    return this.storageService.removeUserStorageFiles(user, filePaths)
  }

  @Mutation()
  @UseGuards(UserGuard)
  async moveUserStorageDir(@User() user: IdToken, @Args('dirPath') dirPath: string, @Args('toDirPath') toDirPath: string): Promise<StorageNode[]> {
    return this.storageService.moveUserStorageDir(user, dirPath, toDirPath)
  }

  @Mutation()
  @UseGuards(UserGuard)
  async moveUserStorageFile(@User() user: IdToken, @Args('filePath') filePath: string, @Args('toFilePath') toFilePath: string): Promise<StorageNode> {
    return this.storageService.moveUserStorageFile(user, filePath, toFilePath)
  }

  @Mutation()
  @UseGuards(UserGuard)
  async renameUserStorageDir(@User() user: IdToken, @Args('dirPath') dirPath: string, @Args('newName') newName: string): Promise<StorageNode[]> {
    return this.storageService.renameUserStorageDir(user, dirPath, newName)
  }

  @Mutation()
  @UseGuards(UserGuard)
  async renameUserStorageFile(@User() user: IdToken, @Args('filePath') filePath: string, @Args('newName') newName: string): Promise<StorageNode> {
    return this.storageService.renameUserStorageFile(user, filePath, newName)
  }

  @Query()
  @UseGuards(UserGuard)
  @Roles(AuthRoleType.AppAdmin)
  async signedUploadUrls(@GQLCtx() context: GQLContext, @Args('inputs') inputs: SignedUploadUrlInput[]): Promise<string[]> {
    const requestOrigin = (context.req.headers.origin as string) || ''
    return this.storageService.getSignedUploadUrls(requestOrigin, inputs)
  }

  @Query()
  @UseGuards(UserGuard)
  @Roles(AuthRoleType.AppAdmin)
  async storageDirNodes(@Args('dirPath') dirPath: string): Promise<StorageNode[]> {
    return this.storageService.getStorageDirNodes(dirPath)
  }

  @Mutation()
  @UseGuards(UserGuard)
  @Roles(AuthRoleType.AppAdmin)
  async createStorageDirs(@Args('dirPaths') dirPaths: string[]): Promise<StorageNode[]> {
    return this.storageService.createStorageDirs(dirPaths)
  }

  @Mutation()
  @UseGuards(UserGuard)
  @Roles(AuthRoleType.AppAdmin)
  async removeStorageDirs(@Args('dirPaths') dirPaths: string[]): Promise<StorageNode[]> {
    return this.storageService.removeStorageDirs(dirPaths)
  }

  @Mutation()
  @UseGuards(UserGuard)
  @Roles(AuthRoleType.AppAdmin)
  async removeStorageFiles(@Args('filePaths') filePaths: string[]): Promise<StorageNode[]> {
    return this.storageService.removeStorageFiles(filePaths)
  }

  @Mutation()
  @UseGuards(UserGuard)
  @Roles(AuthRoleType.AppAdmin)
  async moveStorageDir(@Args('dirPath') dirPath: string, @Args('toDirPath') toDirPath: string): Promise<StorageNode[]> {
    return this.storageService.moveStorageDir(dirPath, toDirPath)
  }

  @Mutation()
  @UseGuards(UserGuard)
  @Roles(AuthRoleType.AppAdmin)
  async moveStorageFile(@Args('filePath') filePath: string, @Args('toFilePath') toFilePath: string): Promise<StorageNode> {
    return this.storageService.moveStorageFile(filePath, toFilePath)
  }

  @Mutation()
  @UseGuards(UserGuard)
  @Roles(AuthRoleType.AppAdmin)
  async renameStorageDir(@Args('dirPath') dirPath: string, @Args('newName') newName: string): Promise<StorageNode[]> {
    return this.storageService.renameStorageDir(dirPath, newName)
  }

  @Mutation()
  @UseGuards(UserGuard)
  @Roles(AuthRoleType.AppAdmin)
  async renameStorageFile(@Args('filePath') filePath: string, @Args('newName') newName: string): Promise<StorageNode> {
    return this.storageService.renameStorageFile(filePath, newName)
  }
}

@Module({
  providers: [StorageResolver],
})
export class GQLStorageModule {}
