import { AuthServiceDI } from './services/auth'
import { HTTPLoggingServiceDI } from './services/logging'
import { Module } from '@nestjs/common'

//========================================================================
//
//  Implementation
//
//========================================================================

@Module({
  providers: [AuthServiceDI.provider, HTTPLoggingServiceDI.provider],
  exports: [AuthServiceDI.provider, HTTPLoggingServiceDI.provider],
})
class AuthModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { AuthModule }
