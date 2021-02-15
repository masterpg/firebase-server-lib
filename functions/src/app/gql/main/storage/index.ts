import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import {
  ArticleTableOfContentsNode,
  AuthServiceDI,
  AuthServiceModule,
  CreateArticleTypeDirInput,
  CreateStorageNodeOptions,
  GetArticleChildrenInput,
  IdToken,
  SaveArticleSrcMasterFileResult,
  SignedUploadUrlInput,
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
import { AuthGuard, GQLContext, GQLContextArg, UserArg } from '../../../nest'
import { Inject, Module, UseGuards } from '@nestjs/common'
import { AppError } from '../../../base'

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
  async storageNode(@UserArg() user: IdToken, @Args('input') input: StorageNodeGetKeyInput): Promise<StorageNode | undefined> {
    return this.getAccessibleNode(user, input)
  }

  @Query()
  async storageNodes(@UserArg() user: IdToken, @Args('input') input: StorageNodeGetKeysInput): Promise<StorageNode[]> {
    // 引数指定なしエラー
    if (!input.ids && !input.paths) {
      throw new AppError(`Both 'ids' and 'paths' are not specified.`)
    }

    const result: StorageNode[] = []

    // ID検索
    if (input.ids?.length) {
      // 引数IDでノードを検索
      result.push(...(await this.storageService.getNodes({ ids: input.ids })))
      // 検索されたノードに閲覧可能か検証
      await this.storageService.validateBrowsableNodes(user, { nodes: result })
    }

    // パス検索
    if (input.paths?.length) {
      // 引数パスのノードに閲覧可能か検証
      await this.storageService.validateBrowsableNodes(user, { nodePaths: input.paths })
      // 引数パスでノード検索
      result.push(...(await this.storageService.getNodes({ paths: input.paths })))
    }

    return result
  }

  @Query()
  async storageDirDescendants(
    @UserArg() user: IdToken,
    @Args('dirPath') dirPath?: string,
    @Args('pagination') pagination?: StoragePaginationInput
  ): Promise<StoragePaginationResult<StorageNode>> {
    await this.storageService.validateBrowsableNodes(user, { dirPath })
    return this.storageService.getDirDescendants(dirPath, pagination)
  }

  @Query()
  async storageDescendants(
    @UserArg() user: IdToken,
    @Args('dirPath') dirPath?: string,
    @Args('pagination') pagination?: StoragePaginationInput
  ): Promise<StoragePaginationResult<StorageNode>> {
    await this.storageService.validateBrowsableNodes(user, { dirPath })
    return this.storageService.getDescendants(dirPath, pagination)
  }

  @Query()
  async storageDirChildren(
    @UserArg() user: IdToken,
    @Args('dirPath') dirPath?: string,
    @Args('pagination') pagination?: StoragePaginationInput
  ): Promise<StoragePaginationResult<StorageNode>> {
    await this.storageService.validateBrowsableNodes(user, { dirPath })
    return this.storageService.getDirChildren(dirPath, pagination)
  }

  @Query()
  async storageChildren(
    @UserArg() user: IdToken,
    @Args('dirPath') dirPath?: string,
    @Args('pagination') pagination?: StoragePaginationInput
  ): Promise<StoragePaginationResult<StorageNode>> {
    await this.storageService.validateBrowsableNodes(user, { dirPath })
    return this.storageService.getChildren(dirPath, pagination)
  }

  @Query()
  async storageHierarchicalNodes(@UserArg() user: IdToken, @Args('nodePath') nodePath: string): Promise<StorageNode[]> {
    await this.storageService.validateBrowsableNodes(user, { nodePath })
    return this.storageService.getHierarchicalNodes(nodePath)
  }

  @Query()
  async storageAncestorDirs(@UserArg() user: IdToken, @Args('nodePath') nodePath: string): Promise<StorageNode[]> {
    await this.storageService.validateBrowsableNodes(user, { nodePath })
    return this.storageService.getAncestorDirs(nodePath)
  }

  @Mutation()
  async createStorageDir(
    @UserArg() user: IdToken,
    @Args('dirPath') dirPath: string,
    @Args('options') options?: CreateStorageNodeOptions
  ): Promise<StorageNode> {
    await this.storageService.validateBrowsableNodes(user, { dirPath })
    return this.storageService.createDir(dirPath, options)
  }

  @Mutation()
  async createStorageHierarchicalDirs(@UserArg() user: IdToken, @Args('dirPaths') dirPaths: string[]): Promise<StorageNode[]> {
    await this.storageService.validateBrowsableNodes(user, { dirPaths })
    return this.storageService.createHierarchicalDirs(dirPaths)
  }

  @Mutation()
  async removeStorageFile(@UserArg() user: IdToken, @Args('filePath') filePath: string): Promise<StorageNode | undefined> {
    await this.storageService.validateBrowsableNodes(user, { filePath })
    return await this.storageService.removeFile(filePath)
  }

  @Mutation()
  async moveStorageFile(
    @UserArg() user: IdToken,
    @Args('fromFilePath') fromFilePath: string,
    @Args('toFilePath') toFilePath: string
  ): Promise<StorageNode> {
    await this.storageService.validateBrowsableNodes(user, { nodePaths: [fromFilePath, toFilePath] })
    return await this.storageService.moveFile(fromFilePath, toFilePath)
  }

  @Mutation()
  async renameStorageFile(@UserArg() user: IdToken, @Args('filePath') filePath: string, @Args('newName') newName: string): Promise<StorageNode> {
    await this.storageService.validateBrowsableNodes(user, { filePath })
    return await this.storageService.renameFile(filePath, newName)
  }

  @Mutation()
  async setStorageDirShareSettings(
    @UserArg() user: IdToken,
    @Args('dirPath') dirPath: string,
    @Args('input') input: StorageNodeShareSettingsInput
  ): Promise<StorageNode> {
    await this.storageService.validateBrowsableNodes(user, { dirPath })
    return this.storageService.setDirShareSettings(dirPath, input)
  }

  @Mutation()
  async setStorageFileShareSettings(
    @UserArg() user: IdToken,
    @Args('filePath') filePath: string,
    @Args('input') input: StorageNodeShareSettingsInput
  ): Promise<StorageNode> {
    await this.storageService.validateBrowsableNodes(user, { filePath })
    return this.storageService.setFileShareSettings(filePath, input)
  }

  @Mutation()
  async handleUploadedFile(@UserArg() user: IdToken, @Args('input') input: StorageNodeKeyInput): Promise<StorageNode> {
    await this.storageService.validateBrowsableNodes(user, { nodePath: input.path })
    return await this.storageService.handleUploadedFile(input)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async setFileAccessAuthClaims(@UserArg() user: IdToken, @Args('input') input: StorageNodeKeyInput): Promise<string> {
    return this.storageService.setFileAccessAuthClaims(user, input)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async removeFileAccessAuthClaims(@UserArg() user: IdToken): Promise<string> {
    return this.storageService.removeFileAccessAuthClaims(user)
  }

  @Query()
  async signedUploadUrls(
    @GQLContextArg() ctx: GQLContext,
    @UserArg() user: IdToken,
    @Args('inputs') inputs: SignedUploadUrlInput[]
  ): Promise<string[]> {
    const nodePaths = inputs.map(input => input.path)
    await this.storageService.validateBrowsableNodes(user, { nodePaths })
    const requestOrigin = (ctx.req.headers.origin as string) || ''
    return this.storageService.getSignedUploadUrls(requestOrigin, inputs)
  }

  @Mutation()
  async createArticleTypeDir(
    @UserArg() user: IdToken,
    @Args('input') input: CreateArticleTypeDirInput,
    @Args('options') options: CreateStorageNodeOptions
  ): Promise<StorageNode> {
    await this.storageService.validateBrowsableNodes(user, { dirPath: input.dir })
    return this.storageService.createArticleTypeDir(input, options)
  }

  @Mutation()
  async createArticleGeneralDir(
    @UserArg() user: IdToken,
    @Args('dirPath') dirPath: string,
    @Args('options') options?: CreateStorageNodeOptions
  ): Promise<StorageNode> {
    await this.storageService.validateBrowsableNodes(user, { dirPath })
    return this.storageService.createArticleGeneralDir(dirPath, options)
  }

  @Mutation()
  async renameArticleDir(@UserArg() user: IdToken, @Args('dirPath') dirPath: string, @Args('newName') newName: string): Promise<StorageNode> {
    await this.storageService.validateBrowsableNodes(user, { dirPath })
    return this.storageService.renameArticleDir(dirPath, newName)
  }

  @Mutation()
  async setArticleSortOrder(@UserArg() user: IdToken, @Args('orderNodePaths') orderNodePaths: string[]): Promise<boolean> {
    await this.storageService.validateBrowsableNodes(user, { nodePaths: orderNodePaths })
    await this.storageService.setArticleSortOrder(user, orderNodePaths)
    return true
  }

  @Mutation()
  async saveArticleSrcMasterFile(
    @UserArg() user: IdToken,
    @Args('articleDirPath') articleDirPath: string,
    @Args('srcContent') srcContent: string,
    @Args('textContent') textContent: string
  ): Promise<SaveArticleSrcMasterFileResult> {
    await this.sgetAccessibleNode(user, { path: articleDirPath })
    return this.storageService.saveArticleSrcMasterFile(articleDirPath, srcContent, textContent)
  }

  @Mutation()
  async saveArticleSrcDraftFile(
    @UserArg() user: IdToken,
    @Args('articleDirPath') articleDirPath: string,
    @Args('srcContent') srcContent: string
  ): Promise<StorageNode> {
    await this.sgetAccessibleNode(user, { path: articleDirPath })
    return this.storageService.saveArticleSrcDraftFile(articleDirPath, srcContent)
  }

  @Query()
  async articleChildren(
    @UserArg() user: IdToken,
    @Args('input') input: GetArticleChildrenInput,
    @Args('pagination') pagination?: StoragePaginationInput
  ): Promise<StoragePaginationResult<StorageNode>> {
    await this.storageService.validateBrowsableNodes(user, { dirPath: input.dirPath })
    return this.storageService.getArticleChildren(input, pagination)
  }

  @Query()
  async articleTableOfContents(@UserArg() user: IdToken, @Args('userName') userName: string): Promise<ArticleTableOfContentsNode[]> {
    return this.storageService.getArticleTableOfContents(userName, user)
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  protected async getAccessibleNode(user: IdToken, key: StorageNodeGetKeyInput): Promise<StorageNode | undefined> {
    // ID検索
    if (key.id) {
      // 引数IDでノードを検索
      const node = await this.storageService.getNode({ id: key.id })
      if (node) {
        // 検索されたノードに閲覧可能な権限があるか検証
        await this.storageService.validateBrowsableNodes(user, { node })
        return node
      } else {
        return undefined
      }
    }
    // パス検索
    else if (key.path) {
      // 引数パスのノードに閲覧可能か検証
      await this.storageService.validateBrowsableNodes(user, { nodePath: key.path })
      // 引数パスでノード検索
      return this.storageService.getNode({ path: key.path })
    }
    // 引数指定なしエラー
    else {
      throw new AppError(`Both 'id' and 'path' are not specified.`)
    }
  }

  protected async sgetAccessibleNode(user: IdToken, key: StorageNodeGetKeyInput): Promise<StorageNode> {
    const node = await this.getAccessibleNode(user, key)
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
  async removeStorageDir(@UserArg() user: IdToken, @Args('dirPath') dirPath: string): Promise<boolean> {
    await this.storageService.validateBrowsableNodes(user, { dirPath })
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
  async moveStorageDir(@UserArg() user: IdToken, @Args('fromDirPath') fromDirPath: string, @Args('toDirPath') toDirPath: string): Promise<boolean> {
    await this.storageService.validateBrowsableNodes(user, { nodePaths: [fromDirPath, toDirPath] })
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
  async renameStorageDir(@UserArg() user: IdToken, @Args('dirPath') dirPath: string, @Args('newName') newName: string): Promise<boolean> {
    await this.storageService.validateBrowsableNodes(user, { dirPath })
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
