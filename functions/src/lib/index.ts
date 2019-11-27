import { AuthServiceDI, CORSServiceDI, FirestoreServiceDI, HandlerLoggingServiceDI, HttpLoggingServiceDI } from './nest'
import { Global, Module } from '@nestjs/common'

@Global()
@Module({
  providers: [
    CORSServiceDI.provider,
    AuthServiceDI.provider,
    HttpLoggingServiceDI.provider,
    HandlerLoggingServiceDI.provider,
    FirestoreServiceDI.provider,
  ],
  exports: [
    CORSServiceDI.provider,
    AuthServiceDI.provider,
    HttpLoggingServiceDI.provider,
    HandlerLoggingServiceDI.provider,
    FirestoreServiceDI.provider,
  ],
})
export class LibBaseModule {}

export {
  CORSConfig,
  FunctionsConfig,
  InputValidationError,
  LibConfig,
  StorageConfig,
  ValidationErrors,
  WriteReadyObserver,
  initFirebaseApp,
  validate,
  validateSync,
} from './base'

export { DateTimeScalar, GQLCtx, getGqlModuleBaseOptions, getTypeDefs } from './gql'

export {
  AuthRoleType,
  AuthServiceDI,
  AuthValidateResult,
  CORSGuardDI,
  CORSMiddleware,
  CORSServiceDI,
  FirestoreServiceDI,
  GQLContext,
  HandlerLoggingData,
  HandlerLoggingMetadata,
  HandlerLoggingResourceData,
  HandlerLoggingServiceDI,
  HandlerLoggingSource,
  HttpLoggingData,
  HttpLoggingMetadata,
  HttpLoggingResourceData,
  HttpLoggingServiceDI,
  HttpLoggingSource,
  IdToken,
  LoggingInterceptorDI,
  LoggingLatencyData,
  LoggingLatencyTimer,
  Roles,
  User,
  UserGuard,
  getAllExecutionContext,
} from './nest'

export {
  BaseAppService,
  BaseDevUtilsService,
  BaseStorageService,
  GCSStorageNode,
  JSON,
  JSONObject,
  PutTestDataInput,
  SignedUploadUrlInput,
  StorageNode,
  StorageNodeType,
  TestSignedUploadUrlInput,
  UploadDataItem,
} from './services'
