import * as _path from 'path'
import { Args, GraphQLModule, Mutation, Query, Resolver } from '@nestjs/graphql'
import { BaseGQLContainerModule, getSchemaFirstGQLModuleOptions } from '../base'
import {
  DevUtilsServiceDI,
  DevUtilsServiceModule,
  PutTestStoreDataInput,
  TestFirebaseUserInput,
  TestSignedUploadUrlInput,
  TestUserInput,
  UserInfo,
} from '../../services'
import { Inject, Module } from '@nestjs/common'
import { config } from '../../../config'

//========================================================================
//
//  Implementation
//
//========================================================================

//--------------------------------------------------
//  GQL Module
//--------------------------------------------------

@Resolver()
export class DevUtilsResolver {
  constructor(@Inject(DevUtilsServiceDI.symbol) protected readonly devUtilsService: DevUtilsServiceDI.type) {}

  @Mutation()
  async putTestStoreData(@Args('inputs') inputs: PutTestStoreDataInput[]): Promise<boolean> {
    await this.devUtilsService.putTestStoreData(inputs)
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

  @Mutation()
  async setTestFirebaseUsers(@Args('users') users: TestFirebaseUserInput[]): Promise<boolean> {
    await this.devUtilsService.setTestFirebaseUsers(...users)
    return true
  }

  @Mutation()
  async deleteTestFirebaseUsers(@Args('uids') uids: string[]): Promise<boolean> {
    await this.devUtilsService.deleteTestFirebaseUsers(...uids)
    return true
  }

  @Mutation()
  async setTestUsers(@Args('users') users: TestUserInput[]): Promise<UserInfo[]> {
    return await this.devUtilsService.setTestUsers(...users)
  }

  @Mutation()
  async deleteTestUsers(@Args('uids') uids: string[]): Promise<boolean> {
    await this.devUtilsService.deleteTestUsers(...uids)
    return true
  }
}

@Module({
  providers: [DevUtilsResolver],
  imports: [DevUtilsServiceModule],
})
class DevUtilsGQLModule {}

//--------------------------------------------------
//  Container Module
//--------------------------------------------------

// `functions`ディレクトリからみたパスを指定
const gqlOptions = getSchemaFirstGQLModuleOptions([
  _path.join(config.functions.buildDir, 'app/gql/dto.graphql'),
  _path.join(config.functions.buildDir, 'app/gql/dev'),
])

const gqlModules = [DevUtilsGQLModule]

@Module({
  imports: [BaseGQLContainerModule, GraphQLModule.forRoot(gqlOptions), ...gqlModules],
})
class DevGQLContainerModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export default DevGQLContainerModule
export { DevUtilsGQLModule }
