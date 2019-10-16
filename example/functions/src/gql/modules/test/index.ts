import { Module } from '@nestjs/common'
import { TestResolver } from './resolver'
import { TestServiceDI } from 'web-server-lib'

@Module({
  providers: [TestServiceDI.provider, TestResolver],
})
export class GQLTestModule {}
