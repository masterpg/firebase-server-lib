import { AppConfig, AuthServiceModule, EnvServiceDI, EnvServiceModule } from '../../../services'
import { Query, Resolver } from '@nestjs/graphql'
import { Inject } from '@nestjs/common'
import { Module } from '@nestjs/common'

//========================================================================
//
//  Implementation
//
//========================================================================

@Resolver()
export class EnvResolver {
  constructor(@Inject(EnvServiceDI.symbol) protected readonly envService: EnvServiceDI.type) {}

  @Query()
  async appConfig(): Promise<AppConfig> {
    return this.envService.appConfig()
  }
}

@Module({
  providers: [EnvResolver],
  imports: [EnvServiceModule, AuthServiceModule],
})
class EnvGQLModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { EnvGQLModule }
