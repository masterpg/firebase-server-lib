import { DevUtilsResolver } from './resolver'
import { DevUtilsServiceDI } from '../../../services'
import { Module } from '@nestjs/common'

@Module({
  providers: [DevUtilsServiceDI.provider, DevUtilsResolver],
})
export class GQLDevUtilsModule {}
