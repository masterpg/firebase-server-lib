import { Module } from '@nestjs/common'
import { TestResolver } from './resolver'
import { TestServiceDI } from 'firebase-server-lib'

@Module({
  providers: [TestServiceDI.provider, TestResolver],
})
export class GQLTestModule {}
