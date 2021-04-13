import { AuthMiddleware, CORSAppGuardDI, CORSMiddleware, HTTPLoggingAppInterceptorDI } from '../../nest'
import { AuthServiceModule, CORSServiceModule, LoggingServiceModule, StorageServiceDI, StorageServiceModule } from '../../services'
import { Controller, Get, Inject, MiddlewareConsumer, Module, Param, Query, Req, RequestMethod, Res } from '@nestjs/common'
import { Request, Response } from 'express'
import { AppError } from '../../base'
import { BaseRESTModule } from '../base'
import KeepAliveRESTModule from '../base/keepalive'
import { LangCode } from 'web-base-lib'

//========================================================================
//
//  Implementation
//
//========================================================================

//========================================================================
//  REST Module
//========================================================================

@Controller()
class StorageController {
  constructor(@Inject(StorageServiceDI.symbol) protected readonly storageService: StorageServiceDI.type) {}

  @Get('nodes/:nodeId')
  async serveFile(@Req() req: Request, @Res() res: Response, @Param('nodeId') nodeId: string): Promise<Response> {
    return this.storageService.serveFile(req, res, { id: nodeId })
  }

  @Get('articles/:articleId')
  async serveArticle(
    @Req() req: Request,
    @Res() res: Response,
    @Param('articleId') articleId: string,
    @Query('lang') lang: LangCode
  ): Promise<Response> {
    if (!lang) throw new AppError(`No "lang" specified.`)
    return this.storageService.getArticleSrcContent(req, res, { articleId, lang })
  }
}

@Module({
  controllers: [StorageController],
  imports: [BaseRESTModule, StorageServiceModule],
})
class StorageRESTModule {}

//========================================================================
//  Container Module
//========================================================================

@Module({
  providers: [HTTPLoggingAppInterceptorDI.provider, CORSAppGuardDI.provider],
  imports: [LoggingServiceModule, CORSServiceModule, AuthServiceModule, KeepAliveRESTModule, StorageRESTModule],
})
class StorageContainerModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
    consumer.apply(AuthMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export default StorageContainerModule
