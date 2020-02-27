import { CORSMiddleware, CORSServiceDI, libBaseProviders } from '../../../src/lib'
import { Global, MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import { MockGQLContainerModule } from './gql'
import { MockRESTContainerModule } from './rest'

@Global()
@Module({
  providers: [...libBaseProviders],
  exports: [...libBaseProviders],
  imports: [MockRESTContainerModule, MockGQLContainerModule],
})
export class MockBaseAppModule {}

@Global()
@Module({
  providers: [CORSServiceDI.provider],
  exports: [CORSServiceDI.provider],
  imports: [MockBaseAppModule],
})
export class MockCORSBaseAppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}
