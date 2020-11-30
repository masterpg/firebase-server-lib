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
} from '../../services'
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import { GQLContext, GQLContextArg } from '../base'
import { Inject } from '@nestjs/common'
import { InputValidationError } from '../../base'
import { Module } from '@nestjs/common'

//========================================================================
//
//  Implementation
//
//========================================================================

@Resolver('StorageNode')
export class StorageResolver {
  constructor(
    @Inject(AuthServiceDI.symbol) protected readonly authService: AuthServiceDI.type,
    @Inject(AppStorageServiceDI.symbol) protected readonly storageService: AppStorageServiceDI.type
  ) {}

  @Query(returns => StorageNode, { nullable: true })
  async storageNode(
    @GQLContextArg() ctx: GQLContext,
    @Args('input', { type: () => StorageNodeKeyInput }) input: StorageNodeKeyInput
  ): Promise<StorageNode | undefined> {
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

  @Query(returns => StoragePaginationResult)
  async storageDirDescendants(
    @GQLContextArg() ctx: GQLContext,
    @Args('dirPath', { type: () => String, nullable: true }) dirPath?: string,
    @Args('input', { type: () => StoragePaginationInput, nullable: true }) input?: StoragePaginationInput
  ): Promise<StoragePaginationResult<StorageNode>> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return this.storageService.getDirDescendants(dirPath, input)
  }

  @Query(returns => StoragePaginationResult)
  async storageDescendants(
    @GQLContextArg() ctx: GQLContext,
    @Args('dirPath', { type: () => String, nullable: true }) dirPath?: string,
    @Args('input', { type: () => StoragePaginationInput, nullable: true }) input?: StoragePaginationInput
  ): Promise<StoragePaginationResult<StorageNode>> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return this.storageService.getDescendants(dirPath, input)
  }

  @Query(returns => StoragePaginationResult)
  async storageDirChildren(
    @GQLContextArg() ctx: GQLContext,
    @Args('dirPath', { type: () => String, nullable: true }) dirPath?: string,
    @Args('input', { type: () => StoragePaginationInput, nullable: true }) input?: StoragePaginationInput
  ): Promise<StoragePaginationResult<StorageNode>> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return this.storageService.getDirChildren(dirPath, input)
  }

  @Query(returns => StoragePaginationResult)
  async storageChildren(
    @GQLContextArg() ctx: GQLContext,
    @Args('dirPath', { type: () => String, nullable: true }) dirPath?: string,
    @Args('input', { type: () => StoragePaginationInput, nullable: true }) input?: StoragePaginationInput
  ): Promise<StoragePaginationResult<StorageNode>> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return this.storageService.getChildren(dirPath, input)
  }

  @Query(returns => [StorageNode])
  async storageHierarchicalNodes(
    @GQLContextArg() ctx: GQLContext,
    @Args('nodePath', { type: () => String }) nodePath: string
  ): Promise<StorageNode[]> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { nodePath })
    return this.storageService.getHierarchicalNodes(nodePath)
  }

  @Query(returns => [StorageNode])
  async storageAncestorDirs(@GQLContextArg() ctx: GQLContext, @Args('nodePath', { type: () => String }) nodePath: string): Promise<StorageNode[]> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { nodePath })
    return this.storageService.getAncestorDirs(nodePath)
  }

  @Mutation(returns => StorageNode)
  async createStorageDir(
    @GQLContextArg() ctx: GQLContext,
    @Args('dirPath', { type: () => String }) dirPath: string,
    @Args('input', { type: () => CreateStorageNodeInput, nullable: true }) input?: CreateStorageNodeInput
  ): Promise<StorageNode> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return this.storageService.createDir(dirPath, input)
  }

  @Mutation(returns => [StorageNode])
  async createStorageHierarchicalDirs(
    @GQLContextArg() ctx: GQLContext,
    @Args('dirPaths', { type: () => [String] }) dirPaths: string[]
  ): Promise<StorageNode[]> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPaths })
    return this.storageService.createHierarchicalDirs(dirPaths)
  }

  @Mutation(returns => StoragePaginationResult)
  async removeStorageDir(
    @GQLContextArg() ctx: GQLContext,
    @Args('dirPath', { type: () => String }) dirPath: string,
    @Args('input', { type: () => StoragePaginationInput }) input: StoragePaginationInput
  ): Promise<StoragePaginationResult<StorageNode>> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return await this.storageService.removeDir(dirPath, input)
  }

  @Mutation(returns => StorageNode, { nullable: true })
  async removeStorageFile(
    @GQLContextArg() ctx: GQLContext,
    @Args('filePath', { type: () => String }) filePath: string
  ): Promise<StorageNode | undefined> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { filePath })
    return await this.storageService.removeFile(filePath)
  }

  @Mutation(returns => StoragePaginationResult)
  async moveStorageDir(
    @GQLContextArg() ctx: GQLContext,
    @Args('fromDirPath', { type: () => String }) fromDirPath: string,
    @Args('toDirPath', { type: () => String }) toDirPath: string,
    @Args('input', { type: () => StoragePaginationInput }) input: StoragePaginationInput
  ): Promise<StoragePaginationResult<StorageNode>> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { nodePaths: [fromDirPath, toDirPath] })
    return await this.storageService.moveDir(fromDirPath, toDirPath, input)
  }

  @Mutation(returns => StorageNode)
  async moveStorageFile(
    @GQLContextArg() ctx: GQLContext,
    @Args('fromFilePath', { type: () => String }) fromFilePath: string,
    @Args('toFilePath', { type: () => String }) toFilePath: string
  ): Promise<StorageNode> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { nodePaths: [fromFilePath, toFilePath] })
    return await this.storageService.moveFile(fromFilePath, toFilePath)
  }

  @Mutation(returns => StoragePaginationResult)
  async renameStorageDir(
    @Args('dirPath', { type: () => String }) dirPath: string,
    @Args('newName', { type: () => String }) newName: string,
    @Args('input', { type: () => StoragePaginationInput }) input: StoragePaginationInput,
    @GQLContextArg() ctx: GQLContext
  ): Promise<StoragePaginationResult<StorageNode>> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return await this.storageService.renameDir(dirPath, newName, input)
  }

  @Mutation(returns => StorageNode)
  async renameStorageFile(
    @GQLContextArg() ctx: GQLContext,
    @Args('filePath', { type: () => String }) filePath: string,
    @Args('newName', { type: () => String }) newName: string
  ): Promise<StorageNode> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { filePath })
    return await this.storageService.renameFile(filePath, newName)
  }

  @Mutation(returns => StorageNode)
  async setStorageDirShareSettings(
    @GQLContextArg() ctx: GQLContext,
    @Args('dirPath', { type: () => String }) dirPath: string,
    @Args('input', { type: () => StorageNodeShareSettingsInput }) input: StorageNodeShareSettingsInput
  ): Promise<StorageNode> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return this.storageService.setDirShareSettings(dirPath, input)
  }

  @Mutation(returns => StorageNode)
  async setStorageFileShareSettings(
    @GQLContextArg() ctx: GQLContext,
    @Args('filePath', { type: () => String }) filePath: string,
    @Args('input', { type: () => StorageNodeShareSettingsInput }) input: StorageNodeShareSettingsInput
  ): Promise<StorageNode> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { filePath })
    return this.storageService.setFileShareSettings(filePath, input)
  }

  @Mutation(returns => StorageNode)
  async handleUploadedFile(@GQLContextArg() ctx: GQLContext, @Args('filePath', { type: () => String }) filePath: string): Promise<StorageNode> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { filePath })
    return await this.storageService.handleUploadedFile(filePath)
  }

  @Query(returns => [String])
  async signedUploadUrls(
    @GQLContextArg() ctx: GQLContext,
    @Args('inputs', { type: () => [SignedUploadUrlInput] }) inputs: SignedUploadUrlInput[]
  ): Promise<string[]> {
    const filePaths = inputs.map(input => input.filePath)
    await this.storageService.validateAccessible(ctx.req, ctx.res, { filePaths })
    const requestOrigin = (ctx.req.headers.origin as string) || ''
    return this.storageService.getSignedUploadUrls(requestOrigin, inputs)
  }

  @Mutation(returns => StorageNode)
  async createArticleTypeDir(
    @GQLContextArg() ctx: GQLContext,
    @Args('input', { type: () => CreateArticleTypeDirInput }) input: CreateArticleTypeDirInput
  ): Promise<StorageNode> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath: input.dir })
    return this.storageService.createArticleTypeDir(input)
  }

  @Mutation(returns => StorageNode)
  async createArticleGeneralDir(
    @GQLContextArg() ctx: GQLContext,
    @Args('dirPath', { type: () => String }) dirPath: string,
    @Args('input', { type: () => CreateStorageNodeInput, nullable: true }) input?: CreateStorageNodeInput
  ): Promise<StorageNode> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return this.storageService.createArticleGeneralDir(dirPath, input)
  }

  @Mutation(returns => StorageNode)
  async renameArticleNode(
    @GQLContextArg() ctx: GQLContext,
    @Args('nodePath', { type: () => String }) nodePath: string,
    @Args('newName', { type: () => String }) newName: string
  ): Promise<StorageNode> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { nodePath })
    return this.storageService.renameArticleNode(nodePath, newName)
  }

  @Mutation(returns => StorageNode)
  async setArticleSortOrder(
    @GQLContextArg() ctx: GQLContext,
    @Args('nodePath', { type: () => String }) nodePath: string,
    @Args('input', { type: () => SetArticleSortOrderInput }) input: SetArticleSortOrderInput
  ): Promise<StorageNode> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, {
      nodePaths: [nodePath, input.insertBeforeNodePath, input.insertAfterNodePath],
    })
    return this.storageService.setArticleSortOrder(nodePath, input)
  }

  @Query(returns => StoragePaginationResult)
  async articleChildren(
    @GQLContextArg() ctx: GQLContext,
    @Args('dirPath', { type: () => String }) dirPath: string,
    @Args('articleTypes', { type: () => [StorageArticleNodeType] }) articleTypes: StorageArticleNodeType[],
    @Args('input', { type: () => StoragePaginationInput, nullable: true }) input?: StoragePaginationInput
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
