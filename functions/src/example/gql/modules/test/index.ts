import { Module } from '@nestjs/common'
import { TestResolver } from './resolver'
import { TestServiceDI } from '../../../../lib'

@Module({
  providers: [TestServiceDI.provider, TestResolver],
})
export class GQLTestModule {}
