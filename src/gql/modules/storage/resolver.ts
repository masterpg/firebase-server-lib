import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import { AuthRoleType, IdToken } from '../../../services/base'
import { GQLContext, Roles, User } from '../../../nest'
import { Inject, UseGuards } from '@nestjs/common'
import { SignedUploadUrlInput, StorageNode, StorageServiceDI } from '../../../services/business'
import { GQLCtx } from '../../decorators/context'
import { UserGuard } from '../../../nest/guards/user'

@Resolver('StorageNode')
export class StorageResolver {
  constructor(@Inject(StorageServiceDI.symbol) protected readonly storageService: StorageServiceDI.type) {}

  @Query()
  @UseGuards(UserGuard)
  async userStorageBasePath(@User() user: IdToken): Promise<string> {
    return this.storageService.getUserStorageDirPath(user)
  }

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
  async removeUserStorageFiles(@User() user: IdToken, @Args('filePaths') filePaths: string[]): Promise<StorageNode[]> {
    return this.storageService.removeUserStorageFiles(user, filePaths)
  }

  @Mutation()
  @UseGuards(UserGuard)
  async removeUserStorageDir(@User() user: IdToken, @Args('dirPath') dirPath: string): Promise<StorageNode[]> {
    return this.storageService.removeUserStorageDir(user, dirPath)
  }

  @Query()
  @UseGuards(UserGuard)
  @Roles(AuthRoleType.AppAdmin)
  async signedUploadUrls(@GQLCtx() context: GQLContext, @Args('inputs') inputs: SignedUploadUrlInput[]): Promise<string[]> {
    const requestOrigin = (context.req.headers.origin as string) || ''
    return this.storageService.getSignedUploadUrls(requestOrigin, inputs)
  }
}
