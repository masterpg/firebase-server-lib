import { AppStorageServiceDI, AppStorageServiceModule, CORSServiceModule, LoggingServiceModule } from '../../services'
import { CORSAppGuardDI, CORSMiddleware, HTTPLoggingAppInterceptorDI } from '../../nest'
import { Controller, Get, Inject, MiddlewareConsumer, Module, Param, Req, RequestMethod, Res } from '@nestjs/common'
import { Request, Response } from 'express'
import { BaseRESTModule } from '../base'
import KeepAliveRESTModule from '../base/keepalive'

//========================================================================
//
//  Implementation
//
//========================================================================

//--------------------------------------------------
//  REST Module
//--------------------------------------------------

@Controller()
class StorageController {
  constructor(@Inject(AppStorageServiceDI.symbol) protected readonly storageService: AppStorageServiceDI.type) {}

  @Get(':nodeId')
  async serveFile(@Req() req: Request, @Res() res: Response, @Param('nodeId') nodeId: string): Promise<Response> {
    return this.storageService.serveFile(req, res, nodeId)
  }
}

@Module({
  controllers: [StorageController],
  imports: [BaseRESTModule, AppStorageServiceModule],
})
class StorageRESTModule {}

//--------------------------------------------------
//  Container Module
//--------------------------------------------------

@Module({
  providers: [HTTPLoggingAppInterceptorDI.provider, CORSAppGuardDI.provider],
  imports: [LoggingServiceModule, CORSServiceModule, KeepAliveRESTModule, StorageRESTModule],
})
class StorageContainerModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export default StorageContainerModule
