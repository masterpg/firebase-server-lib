import { FunctionsEventLoggingServiceDI, HTTPLoggingServiceDI } from './services/logging'
import { Module } from '@nestjs/common'

//========================================================================
//
//  Implementation
//
//========================================================================

@Module({
  providers: [HTTPLoggingServiceDI.provider, FunctionsEventLoggingServiceDI.provider],
  exports: [HTTPLoggingServiceDI.provider, FunctionsEventLoggingServiceDI.provider],
})
class LoggingModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { LoggingModule }
