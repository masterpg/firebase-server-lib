import { FunctionsEventLoggingServiceDI } from './functions-event-logging'
import { HTTPLoggingServiceDI } from './http-logging'
import { Module } from '@nestjs/common'

@Module({
  providers: [HTTPLoggingServiceDI.provider, FunctionsEventLoggingServiceDI.provider],
  exports: [HTTPLoggingServiceDI.provider, FunctionsEventLoggingServiceDI.provider],
})
class LoggingServiceModule {}

export { LoggingServiceModule }
export * from './base'
export * from './functions-event-logging'
export * from './http-logging'
