import { AppStorageServiceDI, AppStorageServiceModule } from '../../services'
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import {
  AuthGuardModule,
  GQLContext,
  GQLContextArg,
  SignedUploadUrlInput,
  StorageNode,
  StorageNodeShareSettingsInput,
  StoragePaginationOptionsInput,
  StoragePaginationResult,
} from '../../../lib'
import { BaseGQLModule } from '../base'
import { Inject } from '@nestjs/common'
import { Module } from '@nestjs/common'

//========================================================================
//
//  Implementation
//
//========================================================================

@Resolver('StorageNode')
export class StorageResolver {
  constructor(@Inject(AppStorageServiceDI.symbol) protected readonly storageService: AppStorageServiceDI.type) {}

  @Query()
  async storageNode(@GQLContextArg() ctx: GQLContext, @Args('nodePath') nodePath: string): Promise<StorageNode | undefined> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { nodePath })
    return this.storageService.getNodeByPath(nodePath)
  }

  @Query()
  async storageDirDescendants(
    @GQLContextArg() ctx: GQLContext,
    @Args('dirPath') dirPath?: string,
    @Args('options') options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return this.storageService.getDirDescendants(dirPath, options)
  }

  @Query()
  async storageDescendants(
    @GQLContextArg() ctx: GQLContext,
    @Args('dirPath') dirPath?: string,
    @Args('options') options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return this.storageService.getDescendants(dirPath, options)
  }

  @Query()
  async storageDirChildren(
    @GQLContextArg() ctx: GQLContext,
    @Args('dirPath') dirPath?: string,
    @Args('options') options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return this.storageService.getDirChildren(dirPath, options)
  }

  @Query()
  async storageChildren(
    @GQLContextArg() ctx: GQLContext,
    @Args('dirPath') dirPath?: string,
    @Args('options') options?: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return this.storageService.getChildren(dirPath, options)
  }

  @Query()
  async storageHierarchicalNodes(@GQLContextArg() ctx: GQLContext, @Args('nodePath') nodePath: string): Promise<StorageNode[]> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { nodePath })
    return this.storageService.getHierarchicalNodes(nodePath)
  }

  @Query()
  async storageAncestorDirs(@GQLContextArg() ctx: GQLContext, @Args('nodePath') nodePath: string): Promise<StorageNode[]> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { nodePath })
    console.log(nodePath)
    return this.storageService.getAncestorDirs(nodePath)
  }

  @Mutation()
  async createStorageDirs(@GQLContextArg() ctx: GQLContext, @Args('dirPaths') dirPaths: string[]): Promise<StorageNode[]> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPaths })
    return this.storageService.createDirs(dirPaths)
  }

  @Mutation()
  async removeStorageDir(
    @GQLContextArg() ctx: GQLContext,
    @Args('dirPath') dirPath: string,
    @Args('options') options: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return await this.storageService.removeDir(dirPath, options)
  }

  @Mutation()
  async removeStorageFile(@GQLContextArg() ctx: GQLContext, @Args('filePath') filePath: string): Promise<StorageNode | undefined> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { filePath })
    return await this.storageService.removeFile(filePath)
  }

  @Mutation()
  async moveStorageDir(
    @GQLContextArg() ctx: GQLContext,
    @Args('fromDirPath') fromDirPath: string,
    @Args('toDirPath') toDirPath: string,
    @Args('options') options: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { nodePaths: [fromDirPath, toDirPath] })
    return await this.storageService.moveDir(fromDirPath, toDirPath, options)
  }

  @Mutation()
  async moveStorageFile(
    @GQLContextArg() ctx: GQLContext,
    @Args('fromFilePath') fromFilePath: string,
    @Args('toFilePath') toFilePath: string
  ): Promise<StorageNode> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { nodePaths: [fromFilePath, toFilePath] })
    return await this.storageService.moveFile(fromFilePath, toFilePath)
  }

  @Mutation()
  async renameStorageDir(
    @GQLContextArg() ctx: GQLContext,
    @Args('dirPath') dirPath: string,
    @Args('newName') newName: string,
    @Args('options') options: StoragePaginationOptionsInput
  ): Promise<StoragePaginationResult> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return await this.storageService.renameDir(dirPath, newName, options)
  }

  @Mutation()
  async renameStorageFile(
    @GQLContextArg() ctx: GQLContext,
    @Args('filePath') filePath: string,
    @Args('newName') newName: string
  ): Promise<StorageNode> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { filePath })
    return await this.storageService.renameFile(filePath, newName)
  }

  @Mutation()
  async setStorageDirShareSettings(
    @GQLContextArg() ctx: GQLContext,
    @Args('dirPath') dirPath: string,
    @Args('settings') settings: StorageNodeShareSettingsInput
  ): Promise<StorageNode> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return this.storageService.setDirShareSettings(dirPath, settings)
  }

  @Mutation()
  async setStorageFileShareSettings(
    @GQLContextArg() ctx: GQLContext,
    @Args('filePath') filePath: string,
    @Args('settings') settings: StorageNodeShareSettingsInput
  ): Promise<StorageNode> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { filePath })
    return this.storageService.setFileShareSettings(filePath, settings)
  }

  @Mutation()
  async handleUploadedFile(@GQLContextArg() ctx: GQLContext, @Args('filePath') filePath: string): Promise<StorageNode> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { filePath })
    return await this.storageService.handleUploadedFile(filePath)
  }

  @Query()
  async signedUploadUrls(@GQLContextArg() ctx: GQLContext, @Args('inputs') inputs: SignedUploadUrlInput[]): Promise<string[]> {
    const filePaths = inputs.map(input => input.filePath)
    await this.storageService.validateAccessible(ctx.req, ctx.res, { filePaths })
    const requestOrigin = (ctx.req.headers.origin as string) || ''
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
