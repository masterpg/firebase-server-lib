import { CartController } from './controller'
import { CartServiceDI } from '../../../services'
import { Module } from '@nestjs/common'

@Module({
  controllers: [CartController],
  providers: [CartServiceDI.provider],
})
export class RESTCartModule {}
