import { AuthServiceDI, CORSServiceDI, FirestoreServiceDI, HandlerLoggingServiceDI, HttpLoggingServiceDI } from './nest'
import { LibDevUtilsServiceDI, LibStorageServiceDI } from './services'

export const libBaseProviders = [
  CORSServiceDI.provider,
  AuthServiceDI.provider,
  HttpLoggingServiceDI.provider,
  HandlerLoggingServiceDI.provider,
  FirestoreServiceDI.provider,
  LibStorageServiceDI.provider,
  LibDevUtilsServiceDI.provider,
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
