import {
  AppStorageServiceDI,
  AppStorageServiceModule,
  AuthServiceDI,
  AuthServiceModule,
  StorageNode,
  StoragePaginationInput,
  StoragePaginationResult,
} from '../../../services'
import { Args, Mutation, Resolver } from '@nestjs/graphql'
import { GQLContext, GQLContextArg } from '../../base'
import { Inject } from '@nestjs/common'
import { Module } from '@nestjs/common'

//========================================================================
//
//  Implementation
//
//========================================================================

@Resolver()
export class MiddleStorageResolver {
  constructor(
    @Inject(AuthServiceDI.symbol) protected readonly authService: AuthServiceDI.type,
    @Inject(AppStorageServiceDI.symbol) protected readonly storageService: AppStorageServiceDI.type
  ) {}

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
  async renameStorageDir(
    @Args('dirPath') dirPath: string,
    @Args('newName') newName: string,
    @Args('input') input: StoragePaginationInput,
    @GQLContextArg() ctx: GQLContext
  ): Promise<StoragePaginationResult<StorageNode>> {
    await this.storageService.validateAccessible(ctx.req, ctx.res, { dirPath })
    return await this.storageService.renameDir(dirPath, newName, input)
  }
}

@Module({
  providers: [MiddleStorageResolver],
  imports: [AppStorageServiceModule, AuthServiceModule],
})
class MiddleStorageGQLModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { MiddleStorageGQLModule }
