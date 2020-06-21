import { AuthGuardModule, IdToken, UserArg } from '../../../lib/nest'
import { Controller, Get, Module } from '@nestjs/common'
import { BaseRESTModule } from '../base'

//========================================================================
//
//  Implementation
//
//========================================================================

@Controller('keepalive')
class KeepAliveController {
  @Get()
  async keepAlive(@UserArg() user: IdToken): Promise<boolean> {
    return true
  }
}

@Module({
  controllers: [KeepAliveController],
  imports: [BaseRESTModule, AuthGuardModule],
})
class KeepAliveRESTModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export default KeepAliveRESTModule
