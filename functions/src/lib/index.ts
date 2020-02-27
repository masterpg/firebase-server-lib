import { AuthServiceDI, CORSServiceDI, FirestoreServiceDI, HandlerLoggingServiceDI, HttpLoggingServiceDI } from './nest'
import { LibDevUtilsServiceDI, LibStorageServiceDI } from './services'

export const libBaseProviders = [
  AuthServiceDI.provider,
  CORSServiceDI.provider,
  FirestoreServiceDI.provider,
  HandlerLoggingServiceDI.provider,
  HttpLoggingServiceDI.provider,
  LibDevUtilsServiceDI.provider,
  LibStorageServiceDI.provider,
]

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
  AuthGuard,
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
  getAllExecutionContext,
} from './nest'

export {
  BaseFoundationService,
  GCSStorageNode,
  JSON,
  JSONObject,
  LibDevUtilsService,
  LibDevUtilsServiceDI,
  LibStorageService,
  LibStorageServiceDI,
  PutTestDataInput,
  SignedUploadUrlInput,
  StorageNode,
  StorageNodeShareSettings,
  StorageNodeShareSettingsInput,
  StorageNodeType,
  StorageUser,
  TestSignedUploadUrlInput,
  UploadDataItem,
} from './services'
