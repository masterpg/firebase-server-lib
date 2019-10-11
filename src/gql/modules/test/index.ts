import { Module } from '@nestjs/common'
import { TestResolver } from './resolver'
import { TestServiceDI } from '../../../services/business'

@Module({
  providers: [TestServiceDI.provider, TestResolver],
})
export class GQLTestModule {}
