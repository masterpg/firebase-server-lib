import { Args, Mutation, Query, ResolveField, Resolver } from '@nestjs/graphql'
import {
  ArticleListItem,
  ArticleTableOfContentsItem,
  ArticleTag,
  AuthRoleType,
  AuthServiceDI,
  AuthServiceModule,
  CreateArticleGeneralDirInput,
  CreateArticleTypeDirInput,
  CreateStorageDirInput,
  GetArticleContentsNodeInput,
  GetUserArticleListInput,
  GetUserArticleTableOfContentsInput,
  IdToken,
  MoveStorageDirInput,
  MoveStorageFileInput,
  PagingFirstResult,
  PagingInput,
  PagingResult,
  RenameArticleTypeDirInput,
  RenameStorageDirInput,
  RenameStorageFileInput,
  SaveArticleDraftContentInput,
  SaveArticleSrcContentInput,
  SaveArticleTagInput,
  SignedUploadUrlInput,
  StorageNode,
  StorageNodeGetKeyInput,
  StorageNodeGetKeysInput,
  StorageNodeGetUnderInput,
  StorageNodeKeyInput,
  StorageNodeShareDetailInput,
  StorageServiceDI,
  StorageServiceModule,
} from '../../../services'
import { AuthGuard, GQLContext, GQLContextArg, Roles, UserArg } from '../../../nest'
import { Inject, Module, UseGuards } from '@nestjs/common'

//========================================================================
//
//  Implementation
//
//========================================================================

@Resolver('PagingResult')
export class PagingResultResolver {
  @ResolveField()
  __resolveType(value: any) {
    function isFirst(value: PagingResult): value is PagingFirstResult {
      return Boolean((value as PagingFirstResult).segments)
    }
    return isFirst(value) ? 'PagingFirstResult' : 'PagingAfterResult'
  }
}

@Resolver('PagingListItem')
export class PagingListItemResolver {
  @ResolveField()
  __resolveType(value: any) {
    return 'StorageNode'
  }
}

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
  async storageNode(@UserArg() idToken: IdToken, @Args('key') key: StorageNodeGetKeyInput): Promise<StorageNode | undefined> {
    return this.storageService.getNode(idToken, key)
  }

  @Query()
  @UseGuards(AuthGuard)
  async storageNodes(@UserArg() idToken: IdToken, @Args('keys') keys: StorageNodeGetKeysInput): Promise<StorageNode[]> {
    return this.storageService.getNodes(idToken, keys)
  }

  @Query()
  @UseGuards(AuthGuard)
  async storageDescendants(
    @UserArg() idToken: IdToken,
    @Args('input') input: StorageNodeGetUnderInput,
    @Args('paging') paging?: PagingInput
  ): Promise<PagingResult<StorageNode>> {
    const result = await this.storageService.getDescendants(idToken, input, paging)
    return PagingResult.toResponse(result, 'StorageNode')
  }

  @Query()
  @UseGuards(AuthGuard)
  async storageChildren(
    @UserArg() idToken: IdToken,
    @Args('input') input: StorageNodeGetUnderInput,
    @Args('paging') paging?: PagingInput
  ): Promise<PagingResult<StorageNode>> {
    const result = await this.storageService.getChildren(idToken, input, paging)
    return PagingResult.toResponse(result, 'StorageNode')
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
    @Args('input') input: StorageNodeShareDetailInput
  ): Promise<StorageNode> {
    return this.storageService.setDirShareDetail(idToken, key, input)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async setStorageFileShareDetail(
    @UserArg() idToken: IdToken,
    @Args('key') key: StorageNodeGetKeyInput,
    @Args('input') input: StorageNodeShareDetailInput
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
  async createArticleTypeDir(@UserArg() idToken: IdToken, @Args('input') input: CreateArticleTypeDirInput): Promise<StorageNode> {
    return this.storageService.createArticleTypeDir(idToken, input)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async createArticleGeneralDir(@UserArg() idToken: IdToken, @Args('input') input: CreateArticleGeneralDirInput): Promise<StorageNode> {
    return this.storageService.createArticleGeneralDir(idToken, input)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async renameArticleTypeDir(@UserArg() idToken: IdToken, @Args('input') input: RenameArticleTypeDirInput): Promise<StorageNode> {
    return this.storageService.renameArticleTypeDir(idToken, input)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async setArticleSortOrder(@UserArg() idToken: IdToken, @Args('orderNodePaths') orderNodePaths: string[]): Promise<boolean> {
    await this.storageService.setArticleSortOrder(idToken, orderNodePaths)
    return true
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async saveArticleSrcContent(
    @UserArg() idToken: IdToken,
    @Args('key') key: StorageNodeGetKeyInput,
    @Args('input') input: SaveArticleSrcContentInput
  ): Promise<StorageNode> {
    return this.storageService.saveArticleSrcContent(idToken, key, input)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  async saveArticleDraftContent(
    @UserArg() idToken: IdToken,
    @Args('key') key: StorageNodeGetKeyInput,
    @Args('input') input: SaveArticleDraftContentInput
  ): Promise<StorageNode> {
    return this.storageService.saveArticleDraftContent(idToken, key, input)
  }

  @Mutation()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async saveArticleTags(@Args('inputs') inputs: SaveArticleTagInput[]): Promise<ArticleTag[]> {
    return this.storageService.saveArticleTags(inputs)
  }

  @Query()
  @UseGuards(AuthGuard)
  async articleContentsNode(
    @UserArg() idToken: IdToken,
    @Args('key') key: StorageNodeGetKeyInput,
    @Args('input') input: GetArticleContentsNodeInput
  ): Promise<StorageNode | undefined> {
    return this.storageService.getArticleContentsNode(idToken, key, input)
  }

  @Query()
  async userArticleList(
    @UserArg() idToken: IdToken | undefined,
    @Args('input') input: GetUserArticleListInput,
    @Args('paging') paging?: PagingInput
  ): Promise<PagingResult<ArticleListItem>> {
    const result = await this.storageService.getUserArticleList(idToken, input, paging)
    return PagingResult.toResponse(result, 'ArticleListItem')
  }

  @Query()
  async userArticleTableOfContents(
    @UserArg() idToken: IdToken | undefined,
    @Args('input') input: GetUserArticleTableOfContentsInput
  ): Promise<ArticleTableOfContentsItem[]> {
    return this.storageService.getUserArticleTableOfContents(idToken, input)
  }

  @Query()
  async suggestArticleTags(@Args('keyword') keyword: string): Promise<ArticleTag[]> {
    return this.storageService.suggestArticleTags(keyword)
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
