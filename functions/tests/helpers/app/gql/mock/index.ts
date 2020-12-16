import { AuthMiddleware, CORSAppGuardDI, CORSMiddleware } from '../../../../../src/app/nest'
import { AuthServiceModule, CORSServiceModule } from '../../../../../src/app/services'
import { DateTimeScalar, LongScalar, getSchemaFirstGQLModuleOptions } from '../../../../../src/app/gql/base'
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import { DummyResolver } from './dummy'
import { GraphQLModule } from '@nestjs/graphql'

//========================================================================
//
//  Implementation
//
//========================================================================

const gqlOptions = getSchemaFirstGQLModuleOptions(['tests/helpers/app/gql/mock/index.graphql'])

@Module({
  providers: [DummyResolver, DateTimeScalar, LongScalar],
  imports: [GraphQLModule.forRoot(gqlOptions), AuthServiceModule],
  exports: [AuthServiceModule],
})
class MockGQLModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}

@Module({
  imports: [MockGQLModule, CORSServiceModule],
  exports: [CORSServiceModule],
})
class MockCORSGQLModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}

@Module({
  providers: [CORSAppGuardDI.provider],
  imports: [MockCORSGQLModule],
})
class MockCORSGuardGQLModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { MockGQLModule, MockCORSGQLModule, MockCORSGuardGQLModule }
