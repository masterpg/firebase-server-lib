import { AuthGuard, Roles, TransformInterceptor, UserArg } from '../../../../../../src/app/nest'
import { AuthRoleType, IdToken } from '../../../../../../src/app/services'
import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common'

//========================================================================
//
//  Implementation
//
//========================================================================

@Controller('dummyRESTService')
@UseInterceptors(TransformInterceptor)
class DummyController {
  @Get('public/settings')
  async getPublicSettings(): Promise<{ publicKey: string }> {
    return { publicKey: 'Public Key' }
  }

  @Get('partner/settings')
  async getPartnerSettings(): Promise<{ partnerKey: string }> {
    return { partnerKey: 'Partner Key' }
  }

  @Get('admin/settings')
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async getAdminSettings(@UserArg() user: IdToken): Promise<{ adminKey: string }> {
    // console.log(`User '${user.uid}' has accessed the REST's 'admin/settings'.`)
    return { adminKey: 'Admin Key' }
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export { DummyController }
