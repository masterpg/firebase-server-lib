import { CORSServiceDI } from './services/cors'
import { HTTPLoggingServiceDI } from './services/logging'
import { Module } from '@nestjs/common'

//========================================================================
//
//  Implementation
//
//========================================================================

@Module({
  providers: [CORSServiceDI.provider, HTTPLoggingServiceDI.provider],
  exports: [CORSServiceDI.provider, HTTPLoggingServiceDI.provider],
})
class CORSModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { CORSModule }
