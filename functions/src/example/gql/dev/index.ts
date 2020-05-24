import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import { DevUtilsServiceDI, DevUtilsServiceModule, PutTestDataInput, TestSignedUploadUrlInput } from '../../../lib/services'
import { BaseGQLModule } from '../base'
import { Inject } from '@nestjs/common'
import { Module } from '@nestjs/common'

//========================================================================
//
//  Implementation
//
//========================================================================

@Resolver()
export class DevUtilsResolver {
  constructor(@Inject(DevUtilsServiceDI.symbol) protected readonly devUtilsService: DevUtilsServiceDI.type) {}

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
  imports: [BaseGQLModule, DevUtilsServiceModule],
})
class DevUtilsGQLModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export default DevUtilsGQLModule
