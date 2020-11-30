import { AuthGuard, Roles, UserArg } from '../../../../../src/app/nest'
import { AuthRoleType, IdToken } from '../../../../../src/app/services'
import { Field, ObjectType, Query, Resolver } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'

//========================================================================
//
//  Interfaces
//
//========================================================================

@ObjectType()
class AdminSettings {
  @Field()
  adminKey!: string
}

@ObjectType()
class PartnerSettings {
  @Field()
  partnerKey!: string
}

@ObjectType()
class PublicSettings {
  @Field()
  publicKey!: string
}

//========================================================================
//
//  Implementation
//
//========================================================================

@Resolver()
class DummyResolver {
  @Query(returns => PublicSettings, { name: 'publicSettings' })
  async getPublicSettings(): Promise<PublicSettings> {
    return { publicKey: 'Public Key' }
  }

  @Query(returns => PartnerSettings, { name: 'partnerSettings' })
  async getPartnerSettings(): Promise<PartnerSettings> {
    return { partnerKey: 'Partner Key' }
  }

  @Query(returns => AdminSettings, { name: 'adminSettings' })
  @UseGuards(AuthGuard)
  @Roles(AuthRoleType.AppAdmin)
  async getAdminSettings(@UserArg() user: IdToken): Promise<AdminSettings> {
    // console.log(`User '${user.uid}' has accessed the GraphQL's 'adminSettings'.`)
    return { adminKey: 'Admin Key' }
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export { DummyResolver }
export { AdminSettings, PartnerSettings, PublicSettings }
