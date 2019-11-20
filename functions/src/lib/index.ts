import { AuthServiceDI, CORSServiceDI, FirestoreServiceDI, LoggingServiceDI } from './nest'
import { Global, Module } from '@nestjs/common'

@Global()
@Module({
  providers: [CORSServiceDI.provider, AuthServiceDI.provider, LoggingServiceDI.provider, FirestoreServiceDI.provider],
  exports: [CORSServiceDI.provider, AuthServiceDI.provider, LoggingServiceDI.provider, FirestoreServiceDI.provider],
})
export class LibBaseModule {}

export * from './base'
export * from './gql'
export * from './nest'
export * from './services'
