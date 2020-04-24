import {
  CORSAppGuardDI,
  CORSGuardModule,
  CORSMiddleware,
  DateTimeScalar,
  HttpLoggingAppInterceptorDI,
  HttpLoggingInterceptorModule,
  getBaseGQLModuleOptions,
} from '../../lib'
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common'
import { GqlModuleOptions } from '@nestjs/graphql'
import { config } from '../../config'
import { merge } from 'lodash'

export function getGQLModuleOptions(schemaFiles: string[]): GqlModuleOptions {
  const result: GqlModuleOptions = {
    ...getBaseGQLModuleOptions([...config.gql.schema.presetFiles, ...schemaFiles]),
    path: '/',
  }
  if (process.env.NODE_ENV !== 'production') {
    merge(result, {
      debug: true,
      playground: true,
      introspection: true,
    })
  }
  return result
}

@Module({
  providers: [DateTimeScalar, HttpLoggingAppInterceptorDI.provider, CORSAppGuardDI.provider],
  imports: [HttpLoggingInterceptorModule, CORSGuardModule],
})
export class BaseGQLModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CORSMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}
