import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import {
  AuthServiceDI,
  AuthServiceModule,
  CreateArticleTypeDirInput,
  CreateStorageNodeInput,
  IdToken,
  SignedUploadUrlInput,
  StorageArticleDirType,
  StorageNode,
  StorageNodeGetKeyInput,
  StorageNodeGetKeysInput,
  StorageNodeKeyInput,
  StorageNodeShareSettingsInput,
  StoragePaginationInput,
  StoragePaginationResult,
  StorageServiceDI,
  StorageServiceModule,
} from '../../../services'
import { GQLContext, GQLContextArg, UserArg } from '../../../nest'
import { AppError } from '../../../base'
import { Inject } from '@nestjs/common'
import { Module } from '@nestjs/common'

//========================================================================
//
//  Implementation
//
//========================================================================

//--------------------------------------------------
//  Base
//--------------------------------------------------

@Module({
  imports: [StorageServiceModule, AuthServiceModule],
  exports: [StorageServiceModule, AuthServiceModule],
})
class BaseStorageGQLModule {}

//--------------------------------------------------
//  Main
//--------------------------------------------------

@Resolver()
class StorageResolver {
  constructor(
    @Inject(AuthServiceDI.symbol) protected readonly authService: AuthServiceDI.type,
    @Inject(StorageServiceDI.symbol) protected readonly storageService: StorageServiceDI.type
  ) {}

  @Query()
  async storageNode(@GQLContextArg() ctx: GQLContext, @Args('input') input: StorageNodeGetKeyInput): Promise<StorageNode | undefined> {
    return this.getAccessibleNode(ctx, input)
  }

  @Query()
  async storageNodes(@GQLContextArg() ctx: GQLContext, @Args('input') input: StorageNodeGetKeysInput): Promise<StorageNode[]> {
    // 引数指定なしエラー
    if (!input.ids && !input.paths) {
      throw new AppError(`Both 'ids' and 'paths' are not specified.`)
    }

    const result: StorageNode[] = []

    // ID検索
    if (input.ids?.length) {
      // 引数IDでノードを検索
      result.push(...(await this.storageService.getNodes({ ids: input.ids })))
      // 検索されたノードにアクセス可能か検証
      await this.storageService.validateAccessible(ctx.req, ctx.res, { nodes: result })
    }

    // パス検索
    if (input.paths?.length) {
      // 引数パスのノードにアクセス可能か検証
      await this.storageService.validateAccessible(ctx.req, ctx.res, { nodePaths: input.paths })
      // 引数パスでノード検索
      result.push(...(await this.storageService.getNodes({ paths: input.paths })))
    }

    return result
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
  async removeStorageFile(@GQLContextArg() ctx: GQLContext, @Args('filePath') filePath: string): Promise<StorageNode | undefined> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { filePath })
    return await this.storageService.removeFile(filePath)
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
  async handleUploadedFile(@GQLContextArg() ctx: GQLContext, @Args('input') input: StorageNodeKeyInput): Promise<StorageNode> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { nodePath: input.path })
    return await this.storageService.handleUploadedFile(input)
  }

  @Query()
  async signedUploadUrls(@GQLContextArg() ctx: GQLContext, @Args('inputs') inputs: SignedUploadUrlInput[]): Promise<string[]> {
    const nodePaths = inputs.map(input => input.path)
    await this.storageService.validateAccessible(ctx.req, ctx.res, { nodePaths })
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
  async renameArticleDir(@GQLContextArg() ctx: GQLContext, @Args('dirPath') dirPath: string, @Args('newName') newName: string): Promise<StorageNode> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return this.storageService.renameArticleDir(dirPath, newName)
  }

  @Mutation()
  async setArticleSortOrder(
    @GQLContextArg() ctx: GQLContext,
    @UserArg() user: IdToken,
    @Args('orderNodePaths') orderNodePaths: string[]
  ): Promise<boolean> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, {
      nodePaths: orderNodePaths,
    })
    await this.storageService.setArticleSortOrder(user, orderNodePaths)
    return true
  }

  @Mutation()
  async saveArticleSrcDraftFile(
    @GQLContextArg() ctx: GQLContext,
    @Args('articleDirPath') articleDirPath: string,
    @Args('srcContent') srcContent: string
  ): Promise<StorageNode> {
    await this.sgetAccessibleNode(ctx, { path: articleDirPath })
    return this.storageService.saveArticleSrcDraftFile(articleDirPath, srcContent)
  }

  @Query()
  async articleChildren(
    @GQLContextArg() ctx: GQLContext,
    @Args('dirPath') dirPath: string,
    @Args('types') types: StorageArticleDirType[],
    @Args('input') input?: StoragePaginationInput
  ): Promise<StoragePaginationResult<StorageNode>> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return this.storageService.getArticleChildren(dirPath, types, input)
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  protected async getAccessibleNode(ctx: GQLContext, key: StorageNodeGetKeyInput): Promise<StorageNode | undefined> {
    // ID検索
    if (key.id) {
      // 引数IDでノードを検索
      const node = await this.storageService.getNode({ id: key.id })
      if (node) {
        // 検索されたノードにアクセス可能な権限があるか検証
        await this.storageService.validateAccessible(ctx.req, ctx.res, { node })
        return node
      } else {
        return undefined
      }
    }
    // パス検索
    else if (key.path) {
      // 引数パスのノードにアクセス可能か検証
      await this.storageService.validateAccessible(ctx.req, ctx.res, { nodePath: key.path })
      // 引数パスでノード検索
      return this.storageService.getNode({ path: key.path })
    }
    // 引数指定なしエラー
    else {
      throw new AppError(`Both 'id' and 'path' are not specified.`)
    }
  }

  protected async sgetAccessibleNode(ctx: GQLContext, key: StorageNodeGetKeyInput): Promise<StorageNode> {
    const node = await this.getAccessibleNode(ctx, key)
    if (!node) {
      throw new AppError(`There is no node in the specified key.`, { key })
    }
    return node
  }
}

@Module({
  providers: [StorageResolver],
  imports: [BaseStorageGQLModule],
})
class StorageGQLModule {}

//--------------------------------------------------
//  RemoveStorageDir
//--------------------------------------------------

@Resolver()
class RemoveStorageDirResolver {
  constructor(
    @Inject(AuthServiceDI.symbol) protected readonly authService: AuthServiceDI.type,
    @Inject(StorageServiceDI.symbol) protected readonly storageService: StorageServiceDI.type
  ) {}

  @Mutation()
  async removeStorageDir(@GQLContextArg() ctx: GQLContext, @Args('dirPath') dirPath: string): Promise<boolean> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    await this.storageService.removeDir(dirPath)
    return true
  }
}

@Module({
  providers: [RemoveStorageDirResolver],
  imports: [BaseStorageGQLModule],
})
class RemoveStorageDirGQLModule {}

//--------------------------------------------------
//  MoveStorageDir
//--------------------------------------------------

@Resolver()
class MoveStorageDirResolver {
  constructor(
    @Inject(AuthServiceDI.symbol) protected readonly authService: AuthServiceDI.type,
    @Inject(StorageServiceDI.symbol) protected readonly storageService: StorageServiceDI.type
  ) {}

  @Mutation()
  async moveStorageDir(
    @GQLContextArg() ctx: GQLContext,
    @Args('fromDirPath') fromDirPath: string,
    @Args('toDirPath') toDirPath: string
  ): Promise<boolean> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { nodePaths: [fromDirPath, toDirPath] })
    await this.storageService.moveDir(fromDirPath, toDirPath)
    return true
  }
}

@Module({
  providers: [MoveStorageDirResolver],
  imports: [BaseStorageGQLModule],
})
class MoveStorageDirGQLModule {}

//--------------------------------------------------
//  RenameStorageDir
//--------------------------------------------------

@Resolver()
class RenameStorageDirResolver {
  constructor(
    @Inject(AuthServiceDI.symbol) protected readonly authService: AuthServiceDI.type,
    @Inject(StorageServiceDI.symbol) protected readonly storageService: StorageServiceDI.type
  ) {}

  @Mutation()
  async renameStorageDir(@Args('dirPath') dirPath: string, @Args('newName') newName: string, @GQLContextArg() ctx: GQLContext): Promise<boolean> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    await this.storageService.renameDir(dirPath, newName)
    return true
  }
}

@Module({
  providers: [RenameStorageDirResolver],
  imports: [BaseStorageGQLModule],
})
class RenameStorageDirGQLModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { StorageGQLModule, RemoveStorageDirGQLModule, MoveStorageDirGQLModule, RenameStorageDirGQLModule }
