import { AuthServiceModule, CORSServiceModule } from '../../../../src/app/services'
import { CORSAppGuardDI, CORSMiddleware } from '../../../../src/app/nest'
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
})
class MockRESTModule {}

@Module({
  controllers: [DummyController],
  imports: [AuthServiceModule, CORSServiceModule],
})
class MockCORSRESTModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}

@Module({
  controllers: [DummyController],
  providers: [CORSAppGuardDI.provider],
  imports: [AuthServiceModule, CORSServiceModule],
})
class MockCORSGuardRESTModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export { MockRESTModule, MockCORSRESTModule, MockCORSGuardRESTModule }
