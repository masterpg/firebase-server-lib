import { AuthGuard, Roles, UserArg } from '../../nest'
import { AuthRoleType, AuthServiceModule, IdToken } from '../../services'
import { Controller, Get, Module, UseGuards } from '@nestjs/common'
import { BaseRESTModule } from '../base'
import { sleep } from 'web-base-lib'

//========================================================================
//
//  Implementation
//
//========================================================================

@Controller('keepalive')
class KeepAliveController {
  @Get()
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async keepAlive(@UserArg() user: IdToken): Promise<boolean> {
    await sleep(500)
    return true
  }
}

@Module({
  controllers: [KeepAliveController],
  imports: [BaseRESTModule, AuthServiceModule],
})
class KeepAliveRESTModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export default KeepAliveRESTModule
