import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import {
  DevUtilsServiceDI,
  DevUtilsServiceModule,
  PutTestStoreDataInput,
  TestFirebaseUserInput,
  TestSignedUploadUrlInput,
  TestUserInput,
  UserInfo,
} from '../../services'
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

  @Mutation(returns => Boolean)
  async putTestStoreData(@Args('inputs', { type: () => [PutTestStoreDataInput] }) inputs: PutTestStoreDataInput[]): Promise<boolean> {
    await this.devUtilsService.putTestStoreData(inputs)
    return true
  }

  @Query(returns => [String])
  async testSignedUploadUrls(@Args('inputs', { type: () => [TestSignedUploadUrlInput] }) inputs: TestSignedUploadUrlInput[]): Promise<string[]> {
    return await this.devUtilsService.getTestSignedUploadUrls(inputs)
  }

  @Mutation(returns => Boolean)
  async removeTestStorageFiles(@Args('filePaths', { type: () => [String] }) filePaths: string[]): Promise<boolean> {
    await this.devUtilsService.removeTestStorageFiles(filePaths)
    return true
  }

  @Mutation(returns => Boolean)
  async removeTestStorageDir(@Args('dirPath', { type: () => String }) dirPath: string): Promise<boolean> {
    await this.devUtilsService.removeTestStorageDir(dirPath)
    return true
  }

  @Mutation(returns => Boolean)
  async setTestFirebaseUsers(@Args('users', { type: () => [TestFirebaseUserInput] }) users: TestFirebaseUserInput[]): Promise<boolean> {
    await this.devUtilsService.setTestFirebaseUsers(...users)
    return true
  }

  @Mutation(returns => Boolean)
  async deleteTestFirebaseUsers(@Args('uids', { type: () => [String] }) uids: string[]): Promise<boolean> {
    await this.devUtilsService.deleteTestFirebaseUsers(...uids)
    return true
  }

  @Mutation(returns => [UserInfo])
  async setTestUsers(@Args('users', { type: () => [TestUserInput] }) users: TestUserInput[]): Promise<UserInfo[]> {
    return await this.devUtilsService.setTestUsers(...users)
  }

  @Mutation(returns => Boolean)
  async deleteTestUsers(@Args('uids', { type: () => [String] }) uids: string[]): Promise<boolean> {
    await this.devUtilsService.deleteTestUsers(...uids)
    return true
  }
}

@Module({
  providers: [DevUtilsResolver],
  imports: [DevUtilsServiceModule],
})
class DevUtilsGQLModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { DevUtilsGQLModule }
