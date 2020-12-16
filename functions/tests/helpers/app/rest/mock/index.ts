import { AuthMiddleware, CORSAppGuardDI, CORSMiddleware } from '../../../../../src/app/nest'
import { AuthServiceModule, CORSServiceModule } from '../../../../../src/app/services'
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import { DummyController } from './dummy'

//========================================================================
//
//  Implementation
//
//========================================================================

@Module({
  controllers: [DummyController],
  imports: [AuthServiceModule],
  exports: [AuthServiceModule],
})
class MockRESTModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}

@Module({
  imports: [MockRESTModule, CORSServiceModule],
  exports: [CORSServiceModule],
})
class MockCORSRESTModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}

@Module({
  providers: [CORSAppGuardDI.provider],
  imports: [MockCORSRESTModule],
})
class MockCORSGuardRESTModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { MockRESTModule, MockCORSRESTModule, MockCORSGuardRESTModule }
