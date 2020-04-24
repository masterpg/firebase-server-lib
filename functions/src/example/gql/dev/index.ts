import * as path from 'path'
import { Args, GraphQLModule, Mutation, Query, Resolver } from '@nestjs/graphql'
import { BaseGQLModule, getGQLModuleOptions } from '../base'
import { LibDevUtilsServiceDI, LibDevUtilsServiceModule, PutTestDataInput, TestSignedUploadUrlInput } from '../../../lib'
import { Inject } from '@nestjs/common'
import { Module } from '@nestjs/common'
import { config } from '../../../config'

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

const schemaFile = `${path.join(config.gql.schema.moduleDir, 'dev/dev.graphql')}`

@Module({
  providers: [DevUtilsResolver],
  imports: [BaseGQLModule, GraphQLModule.forRoot(getGQLModuleOptions([schemaFile])), LibDevUtilsServiceModule],
})
export default class DevUtilsGQLModule {}
