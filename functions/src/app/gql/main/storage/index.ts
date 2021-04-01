import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import {
  ArticleListItem,
  ArticleTableOfContentsItem,
  AuthServiceDI,
  AuthServiceModule,
  CreateArticleTypeDirInput,
  CreateStorageDirInput,
  GetUserArticleListInput,
  IdToken,
  MoveStorageDirInput,
  MoveStorageFileInput,
  PaginationInput,
  PaginationResult,
  RenameStorageDirInput,
  RenameStorageFileInput,
  SaveArticleMasterSrcFileResult,
  SetShareDetailInput,
  SignedUploadUrlInput,
  StorageNode,
  StorageNodeGetKeyInput,
  StorageNodeGetKeysInput,
  StorageNodeGetUnderInput,
  StorageNodeKeyInput,
  StorageServiceDI,
  StorageServiceModule,
} from '../../../services'
import { AuthGuard, GQLContext, GQLContextArg, UserArg } from '../../../nest'
import { Inject, Module, UseGuards } from '@nestjs/common'

//========================================================================
//
//  Implementation
//
//========================================================================

//========================================================================
//  Base
//========================================================================

@Module({
  imports: [StorageServiceModule, AuthServiceModule],
  exports: [StorageServiceModule, AuthServiceModule],
})
class BaseStorageGQLModule {}

//========================================================================
//  Main
//========================================================================

@Resolver()
class StorageResolver {
  constructor(
    @Inject(AuthServiceDI.symbol) protected readonly authService: AuthServiceDI.type,
    @Inject(StorageServiceDI.symbol) protected readonly storageService: StorageServiceDI.type
  ) {}

  @Query()
  @UseGuards(AuthGuard)
  async storageNode(@UserArg() idToken: IdToken, @Args('input') input: StorageNodeGetKeyInput): Promise<StorageNode | undefined> {
    return this.storageService.getNode(idToken, input)
  }

  @Query()
  @UseGuards(AuthGuard)
  async storageNodes(@UserArg() idToken: IdToken, @Args('input') input: StorageNodeGetKeysInput): Promise<StorageNode[]> {
    return this.storageService.getNodes(idToken, input)
  }

  @Query()
  @UseGuards(AuthGuard)
  async storageDescendants(
    @UserArg() idToken: IdToken,
    @Args('input') input: StorageNodeGetUnderInput,
    @Args('pagination') pagination?: PaginationInput
  ): Promise<PaginationResult<StorageNode>> {
    return this.storageService.getDescendants(idToken, input, pagination)
  }

  @Query()
  @UseGuards(AuthGuard)
  async storageChildren(
    @UserArg() idToken: IdToken,
    @Args('input') input: StorageNodeGetUnderInput,
    @Args('pagination') pagination?: PaginationInput
  ): Promise<PaginationResult<StorageNode>> {
    return this.storageService.getChildren(idToken, input, pagination)
  }

  @Query()
  @UseGuards(AuthGuard)
  async storageHierarchicalNodes(@UserArg() idToken: IdToken, @Args('nodePath') nodePath: string): Promise<StorageNode[]> {
    return this.storageService.getHierarchicalNodes(idToken, nodePath)
  }

  @Query()
  @UseGuards(AuthGuard)
  async storageAncestorDirs(@UserArg() idToken: IdToken, @Args('nodePath') nodePath: string): Promise<StorageNode[]> {
    return this.storageService.getAncestorDirs(idToken, nodePath)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async createStorageDir(@UserArg() idToken: IdToken, @Args('input') input: CreateStorageDirInput): Promise<StorageNode> {
    return this.storageService.createDir(idToken, input)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async createStorageHierarchicalDirs(@UserArg() idToken: IdToken, @Args('dirs') dirs: string[]): Promise<StorageNode[]> {
    return this.storageService.createHierarchicalDirs(idToken, dirs)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async removeStorageFile(@UserArg() idToken: IdToken, @Args('key') key: StorageNodeGetKeyInput): Promise<StorageNode | undefined> {
    return await this.storageService.removeFile(idToken, key)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async moveStorageFile(@UserArg() idToken: IdToken, @Args('input') input: MoveStorageFileInput): Promise<StorageNode> {
    return await this.storageService.moveFile(idToken, input)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async renameStorageFile(@UserArg() idToken: IdToken, @Args('input') input: RenameStorageFileInput): Promise<StorageNode> {
    return await this.storageService.renameFile(idToken, input)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async setStorageDirShareDetail(
    @UserArg() idToken: IdToken,
    @Args('key') key: StorageNodeGetKeyInput,
    @Args('input') input: SetShareDetailInput
  ): Promise<StorageNode> {
    return this.storageService.setDirShareDetail(idToken, key, input)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async setStorageFileShareDetail(
    @UserArg() idToken: IdToken,
    @Args('key') key: StorageNodeGetKeyInput,
    @Args('input') input: SetShareDetailInput
  ): Promise<StorageNode> {
    return this.storageService.setFileShareDetail(idToken, key, input)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async handleUploadedFile(@UserArg() idToken: IdToken, @Args('input') input: StorageNodeKeyInput): Promise<StorageNode> {
    return await this.storageService.handleUploadedFile(idToken, input)
  }

  @Query()
  @UseGuards(AuthGuard)
  async signedUploadUrls(
    @GQLContextArg() ctx: GQLContext,
    @UserArg() idToken: IdToken,
    @Args('inputs') inputs: SignedUploadUrlInput[]
  ): Promise<string[]> {
    const requestOrigin = (ctx.req.headers.origin as string) || ''
    return this.storageService.getSignedUploadUrls(idToken, requestOrigin, inputs)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async setFileAccessAuthClaims(@UserArg() idToken: IdToken, @Args('input') input: StorageNodeKeyInput): Promise<string> {
    return this.storageService.setFileAccessAuthClaims(idToken, input)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async removeFileAccessAuthClaims(@UserArg() idToken: IdToken): Promise<string> {
    return this.storageService.removeFileAccessAuthClaims(idToken)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async createArticleTypeDir(
    @UserArg() idToken: IdToken,
    @Args('input') input: CreateArticleTypeDirInput,
    @Args('options') options: CreateStorageNodeOptions
  ): Promise<StorageNode> {
    return this.storageService.createArticleTypeDir(idToken, input, options)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async createArticleGeneralDir(
    @UserArg() idToken: IdToken,
    @Args('dirPath') dirPath: string,
    @Args('options') options?: CreateStorageNodeOptions
  ): Promise<StorageNode> {
    return this.storageService.createArticleGeneralDir(idToken, dirPath, options)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async renameArticleDir(@UserArg() idToken: IdToken, @Args('dirPath') dirPath: string, @Args('newName') newName: string): Promise<StorageNode> {
    return this.storageService.renameArticleDir(idToken, dirPath, newName)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async setArticleSortOrder(@UserArg() idToken: IdToken, @Args('orderNodePaths') orderNodePaths: string[]): Promise<boolean> {
    await this.storageService.setArticleSortOrder(idToken, orderNodePaths)
    return true
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async saveArticleMasterSrcFile(
    @UserArg() idToken: IdToken,
    @Args('articleDirPath') articleDirPath: string,
    @Args('srcContent') srcContent: string,
    @Args('textContent') textContent: string
  ): Promise<SaveArticleMasterSrcFileResult> {
    return this.storageService.saveArticleMasterSrcFile(idToken, articleDirPath, srcContent, textContent)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async saveArticleDraftSrcFile(
    @UserArg() idToken: IdToken,
    @Args('articleDirPath') articleDirPath: string,
    @Args('srcContent') srcContent: string
  ): Promise<StorageNode> {
    return this.storageService.saveArticleDraftSrcFile(idToken, articleDirPath, srcContent)
  }

  @Query()
  @UseGuards(AuthGuard)
  async articleChildren(
    @UserArg() idToken: IdToken,
    @Args('input') input: GetArticleChildrenInput,
    @Args('pagination') pagination?: PaginationInput
  ): Promise<PaginationResult<StorageNode>> {
    return this.storageService.getArticleChildren(input, pagination)
  }

  @Query()
  async userArticleList(
    @UserArg() idToken: IdToken | undefined,
    @Args('input') input: GetUserArticleListInput,
    @Args('pagination') pagination?: PaginationInput
  ): Promise<PaginationResult<ArticleListItem>> {
    return this.storageService.getUserArticleList(idToken, input, pagination)
  }

  @Query()
  async userArticleTableOfContents(
    @UserArg() idToken: IdToken | undefined,
    @Args('userName') userName: string
  ): Promise<ArticleTableOfContentsItem[]> {
    return this.storageService.getUserArticleTableOfContents(idToken, userName)
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------
}

@Module({
  providers: [StorageResolver],
  imports: [BaseStorageGQLModule],
})
class StorageGQLModule {}

//========================================================================
//  RemoveStorageDir
//========================================================================

@Resolver()
class RemoveStorageDirResolver {
  constructor(
    @Inject(AuthServiceDI.symbol) protected readonly authService: AuthServiceDI.type,
    @Inject(StorageServiceDI.symbol) protected readonly storageService: StorageServiceDI.type
  ) {}

  @Mutation()
  @UseGuards(AuthGuard)
  async removeStorageDir(@UserArg() idToken: IdToken, @Args('key') key: StorageNodeGetKeyInput): Promise<boolean> {
    await this.storageService.removeDir(idToken, key)
    return true
  }
}

@Module({
  providers: [RemoveStorageDirResolver],
  imports: [BaseStorageGQLModule],
})
class RemoveStorageDirGQLModule {}

//========================================================================
//  MoveStorageDir
//========================================================================

@Resolver()
class MoveStorageDirResolver {
  constructor(
    @Inject(AuthServiceDI.symbol) protected readonly authService: AuthServiceDI.type,
    @Inject(StorageServiceDI.symbol) protected readonly storageService: StorageServiceDI.type
  ) {}

  @Mutation()
  @UseGuards(AuthGuard)
  async moveStorageDir(@UserArg() idToken: IdToken, @Args('input') input: MoveStorageDirInput): Promise<boolean> {
    await this.storageService.moveDir(idToken, input)
    return true
  }
}

@Module({
  providers: [MoveStorageDirResolver],
  imports: [BaseStorageGQLModule],
})
class MoveStorageDirGQLModule {}

//========================================================================
//  RenameStorageDir
//========================================================================

@Resolver()
class RenameStorageDirResolver {
  constructor(
    @Inject(AuthServiceDI.symbol) protected readonly authService: AuthServiceDI.type,
    @Inject(StorageServiceDI.symbol) protected readonly storageService: StorageServiceDI.type
  ) {}

  @Mutation()
  @UseGuards(AuthGuard)
  async renameStorageDir(@UserArg() idToken: IdToken, @Args('input') input: RenameStorageDirInput): Promise<boolean> {
    await this.storageService.renameDir(idToken, input)
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
