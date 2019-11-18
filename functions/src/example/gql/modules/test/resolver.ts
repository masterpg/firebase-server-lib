import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import { PutTestDataInput, TestServiceDI, TestSignedUploadUrlInput } from '../../../../lib'
import { Inject } from '@nestjs/common'

@Resolver()
export class TestResolver {
  constructor(@Inject(TestServiceDI.symbol) protected readonly testService: TestServiceDI.type) {}

  @Mutation()
  async putTestData(@Args('inputs') inputs: PutTestDataInput[]): Promise<boolean> {
    await this.testService.putTestData(inputs)
    return true
  }

  @Query()
  async testSignedUploadUrls(@Args('inputs') inputs: TestSignedUploadUrlInput[]): Promise<string[]> {
    return await this.testService.getTestSignedUploadUrls(inputs)
  }

  @Mutation()
  async removeTestStorageFiles(@Args('filePaths') filePaths: string[]): Promise<boolean> {
    await this.testService.removeTestStorageFiles(filePaths)
    return true
  }

  @Mutation()
  async removeTestStorageDir(@Args('dirPath') dirPath: string): Promise<boolean> {
    await this.testService.removeTestStorageDir(dirPath)
    return true
  }
}
