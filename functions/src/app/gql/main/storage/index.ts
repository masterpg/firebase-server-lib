import {
  AppStorageServiceDI,
  AppStorageServiceModule,
  AuthServiceDI,
  AuthServiceModule,
  CreateArticleTypeDirInput,
  CreateStorageNodeInput,
  IdToken,
  SignedUploadUrlInput,
  StorageArticleNodeType,
  StorageNode,
  StorageNodeKeyInput,
  StorageNodeKeysInput,
  StorageNodeShareSettingsInput,
  StoragePaginationInput,
  StoragePaginationResult,
} from '../../../services'
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import { GQLContext, GQLContextArg, UserArg } from '../../../nest'
import { Inject } from '@nestjs/common'
import { InputValidationError } from '../../../base'
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
  imports: [AppStorageServiceModule, AuthServiceModule],
  exports: [AppStorageServiceModule, AuthServiceModule],
})
class BaseStorageGQLModule {}

//--------------------------------------------------
//  Main
//--------------------------------------------------

@Resolver()
class StorageResolver {
  constructor(
    @Inject(AuthServiceDI.symbol) protected readonly authService: AuthServiceDI.type,
    @Inject(AppStorageServiceDI.symbol) protected readonly storageService: AppStorageServiceDI.type
  ) {}

  @Query()
  async storageNode(@GQLContextArg() ctx: GQLContext, @Args('input') input: StorageNodeKeyInput): Promise<StorageNode | undefined> {
    // ID検索
    if (input.id) {
      // 引数IDでノードを検索
      const node = await this.storageService.getNode({ id: input.id })
      if (node) {
        // 検索されたノードにアクセス可能な権限があるか検証
        await this.storageService.validateAccessible(ctx.req, ctx.res, { node })
        return node
      } else {
        return undefined
      }
    }
    // パス検索
    else if (input.path) {
      // 引数パスのノードにアクセス可能か検証
      await this.storageService.validateAccessible(ctx.req, ctx.res, { nodePath: input.path })
      // 引数パスでノード検索
      return this.storageService.getNode({ path: input.path })
    }
    // 引数指定なしエラー
    else {
      throw new InputValidationError(`Both 'id' and 'path' are not specified.`)
    }
  }

  @Query()
  async storageNodes(@GQLContextArg() ctx: GQLContext, @Args('input') input: StorageNodeKeysInput): Promise<StorageNode[]> {
    // 引数指定なしエラー
    if (!input.ids && !input.paths) {
      throw new InputValidationError(`Both 'ids' and 'paths' are not specified.`)
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
    @UserArg() user: IdToken,
    @Args('orderNodePaths') orderNodePaths: string[]
  ): Promise<boolean> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, {
      nodePaths: orderNodePaths,
    })
    await this.storageService.setArticleSortOrder(user, orderNodePaths)
    return true
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
    @Inject(AppStorageServiceDI.symbol) protected readonly storageService: AppStorageServiceDI.type
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
    @Inject(AppStorageServiceDI.symbol) protected readonly storageService: AppStorageServiceDI.type
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
    @Inject(AppStorageServiceDI.symbol) protected readonly storageService: AppStorageServiceDI.type
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
