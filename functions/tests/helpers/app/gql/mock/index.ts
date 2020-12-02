import { AuthServiceModule, CORSServiceModule } from '../../../../../src/app/services'
import { CORSAppGuardDI, CORSMiddleware } from '../../../../../src/app/nest'
import { DateTimeScalar, LongScalar, getSchemaFirstGQLModuleOptions } from '../../../../../src/app/gql/base'
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import { DummyResolver } from './dummy'
import { GraphQLModule } from '@nestjs/graphql'

//========================================================================
//
//  Implementation
//
//========================================================================

// `functions`ディレクトリからみたパスを指定
const gqlOptions = getSchemaFirstGQLModuleOptions(['tests/helpers/app/gql/mock'])

@Module({
  providers: [DummyResolver, DateTimeScalar, LongScalar],
  imports: [GraphQLModule.forRoot(gqlOptions), AuthServiceModule],
})
class MockGQLModule {}

@Module({
  providers: [DummyResolver, DateTimeScalar, LongScalar],
  imports: [GraphQLModule.forRoot(gqlOptions), AuthServiceModule, CORSServiceModule],
})
class MockCORSGQLModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}

@Module({
  providers: [DummyResolver, CORSAppGuardDI.provider, DateTimeScalar, LongScalar],
  imports: [GraphQLModule.forRoot(gqlOptions), AuthServiceModule, CORSServiceModule],
})
class MockCORSGuardGQLModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export { MockGQLModule, MockCORSGQLModule, MockCORSGuardGQLModule }
