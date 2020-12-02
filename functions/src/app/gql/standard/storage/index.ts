import {
  AppStorageServiceDI,
  AppStorageServiceModule,
  AuthServiceDI,
  AuthServiceModule,
  CreateArticleTypeDirInput,
  CreateStorageNodeInput,
  SetArticleSortOrderInput,
  SignedUploadUrlInput,
  StorageArticleNodeType,
  StorageNode,
  StorageNodeKeyInput,
  StorageNodeShareSettingsInput,
  StoragePaginationInput,
  StoragePaginationResult,
} from '../../../services'
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import { GQLContext, GQLContextArg } from '../../base'
import { Inject } from '@nestjs/common'
import { InputValidationError } from '../../../base'
import { Module } from '@nestjs/common'

//========================================================================
//
//  Implementation
//
//========================================================================

@Resolver()
export class StorageResolver {
  constructor(
    @Inject(AuthServiceDI.symbol) protected readonly authService: AuthServiceDI.type,
    @Inject(AppStorageServiceDI.symbol) protected readonly storageService: AppStorageServiceDI.type
  ) {}

  @Query()
  async storageNode(@GQLContextArg() ctx: GQLContext, @Args('input') input: StorageNodeKeyInput): Promise<StorageNode | undefined> {
    // パス検索
    if (input.path) {
      await this.storageService.validateAccessible(ctx.req, ctx.res, { nodePath: input.path })
      return this.storageService.getNodeByPath(input.path)
    }
    // ID検索
    else if (input.id) {
      // サインインしていることを検証
      const validated = await this.authService.validateIdToken(ctx.req, ctx.res)
      if (!validated.result) {
        throw validated.error
      }
      // IDでノードを検索
      const node = await this.storageService.getNodeById(input.id)
      if (node) {
        // 検索されたノードにアクセス可能な権限があるか検証
        await this.storageService.validateAccessible(ctx.req, ctx.res, { nodeId: node.id })
        return node
      } else {
        return undefined
      }
    }
    // 引数指定なしエラー
    else {
      throw new InputValidationError(`Both 'path' and 'id' are not specified.`)
    }
  }

  @Query()
  async storageDirDescendants(
    @GQLContextArg() ctx: GQLContext,
    @Args('dirPath') dirPath?: string,
    @Args('input') input?: StoragePaginationInput
  ): Promise<StoragePaginationResult<StorageNode>> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return this.storageService.getDirDescendants(dirPath, input)
  }

  @Query()
  async storageDescendants(
    @GQLContextArg() ctx: GQLContext,
    @Args('dirPath') dirPath?: string,
    @Args('input') input?: StoragePaginationInput
  ): Promise<StoragePaginationResult<StorageNode>> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return this.storageService.getDescendants(dirPath, input)
  }

  @Query()
  async storageDirChildren(
    @GQLContextArg() ctx: GQLContext,
    @Args('dirPath') dirPath?: string,
    @Args('input') input?: StoragePaginationInput
  ): Promise<StoragePaginationResult<StorageNode>> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return this.storageService.getDirChildren(dirPath, input)
  }

  @Query()
  async storageChildren(
    @GQLContextArg() ctx: GQLContext,
    @Args('dirPath') dirPath?: string,
    @Args('input') input?: StoragePaginationInput
  ): Promise<StoragePaginationResult<StorageNode>> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return this.storageService.getChildren(dirPath, input)
  }

  @Query()
  async storageHierarchicalNodes(@GQLContextArg() ctx: GQLContext, @Args('nodePath') nodePath: string): Promise<StorageNode[]> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { nodePath })
    return this.storageService.getHierarchicalNodes(nodePath)
  }

  @Query()
  async storageAncestorDirs(@GQLContextArg() ctx: GQLContext, @Args('nodePath') nodePath: string): Promise<StorageNode[]> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { nodePath })
    return this.storageService.getAncestorDirs(nodePath)
  }

  @Mutation()
  async createStorageDir(
    @GQLContextArg() ctx: GQLContext,
    @Args('dirPath') dirPath: string,
    @Args('input') input?: CreateStorageNodeInput
  ): Promise<StorageNode> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return this.storageService.createDir(dirPath, input)
  }

  @Mutation()
  async createStorageHierarchicalDirs(@GQLContextArg() ctx: GQLContext, @Args('dirPaths') dirPaths: string[]): Promise<StorageNode[]> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPaths })
    return this.storageService.createHierarchicalDirs(dirPaths)
  }

  @Mutation()
  async removeStorageDir(
    @GQLContextArg() ctx: GQLContext,
    @Args('dirPath') dirPath: string,
    @Args('input') input: StoragePaginationInput
  ): Promise<StoragePaginationResult<StorageNode>> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return await this.storageService.removeDir(dirPath, input)
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
    @Args('input') input: StoragePaginationInput
  ): Promise<StoragePaginationResult<StorageNode>> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { nodePaths: [fromDirPath, toDirPath] })
    return await this.storageService.moveDir(fromDirPath, toDirPath, input)
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
    @Args('dirPath') dirPath: string,
    @Args('newName') newName: string,
    @Args('input') input: StoragePaginationInput,
    @GQLContextArg() ctx: GQLContext
  ): Promise<StoragePaginationResult<StorageNode>> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return await this.storageService.renameDir(dirPath, newName, input)
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
    @Args('input') input: StorageNodeShareSettingsInput
  ): Promise<StorageNode> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return this.storageService.setDirShareSettings(dirPath, input)
  }

  @Mutation()
  async setStorageFileShareSettings(
    @GQLContextArg() ctx: GQLContext,
    @Args('filePath') filePath: string,
    @Args('input') input: StorageNodeShareSettingsInput
  ): Promise<StorageNode> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { filePath })
    return this.storageService.setFileShareSettings(filePath, input)
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

  @Mutation()
  async createArticleTypeDir(@GQLContextArg() ctx: GQLContext, @Args('input') input: CreateArticleTypeDirInput): Promise<StorageNode> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath: input.dir })
    return this.storageService.createArticleTypeDir(input)
  }

  @Mutation()
  async createArticleGeneralDir(
    @GQLContextArg() ctx: GQLContext,
    @Args('dirPath') dirPath: string,
    @Args('input') input?: CreateStorageNodeInput
  ): Promise<StorageNode> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return this.storageService.createArticleGeneralDir(dirPath, input)
  }

  @Mutation()
  async renameArticleNode(
    @GQLContextArg() ctx: GQLContext,
    @Args('nodePath') nodePath: string,
    @Args('newName') newName: string
  ): Promise<StorageNode> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { nodePath })
    return this.storageService.renameArticleNode(nodePath, newName)
  }

  @Mutation()
  async setArticleSortOrder(
    @GQLContextArg() ctx: GQLContext,
    @Args('nodePath') nodePath: string,
    @Args('input') input: SetArticleSortOrderInput
  ): Promise<StorageNode> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, {
      nodePaths: [nodePath, input.insertBeforeNodePath, input.insertAfterNodePath],
    })
    return this.storageService.setArticleSortOrder(nodePath, input)
  }

  @Query()
  async articleChildren(
    @GQLContextArg() ctx: GQLContext,
    @Args('dirPath') dirPath: string,
    @Args('articleTypes') articleTypes: StorageArticleNodeType[],
    @Args('input') input?: StoragePaginationInput
  ): Promise<StoragePaginationResult<StorageNode>> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return this.storageService.getArticleChildren(dirPath, articleTypes, input)
  }
}

@Module({
  providers: [StorageResolver],
  imports: [AppStorageServiceModule, AuthServiceModule],
})
class StorageGQLModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { StorageGQLModule }
