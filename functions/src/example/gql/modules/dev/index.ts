import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import { LibDevUtilsServiceDI, PutTestDataInput, TestSignedUploadUrlInput } from '../../../../lib'
import { Inject } from '@nestjs/common'
import { Module } from '@nestjs/common'

@Resolver()
export class DevUtilsResolver {
  constructor(@Inject(LibDevUtilsServiceDI.symbol) protected readonly devUtilsService: LibDevUtilsServiceDI.type) {}

  @Mutation()
  async putTestData(@Args('inputs') inputs: PutTestDataInput[]): Promise<boolean> {
    await this.devUtilsService.putTestData(inputs)
    return true
  }

  @Query()
  async testSignedUploadUrls(@Args('inputs') inputs: TestSignedUploadUrlInput[]): Promise<string[]> {
    return await this.devUtilsService.getTestSignedUploadUrls(inputs)
  }

  @Mutation()
  async removeTestStorageFiles(@Args('filePaths') filePaths: string[]): Promise<boolean> {
    await this.devUtilsService.removeTestStorageFiles(filePaths)
    return true
  }

  @Mutation()
  async removeTestStorageDir(@Args('dirPath') dirPath: string): Promise<boolean> {
    await this.devUtilsService.removeTestStorageDir(dirPath)
    return true
  }
}

@Module({
  providers: [DevUtilsResolver],
})
export class GQLDevUtilsModule {}
