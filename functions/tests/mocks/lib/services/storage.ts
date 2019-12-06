import { BaseStorageService } from '../../../../src/lib/services'
import { Injectable } from '@nestjs/common'

type MockStorageService = BaseStorageService & {
  toStorageNode: BaseStorageService['toStorageNode']
  toStorageNodeByDir: BaseStorageService['toStorageNodeByDir']
  sortStorageNodes: BaseStorageService['sortStorageNodes']
  padVirtualDirNode: BaseStorageService['padVirtualDirNode']
  splitHierarchicalDirPaths: BaseStorageService['splitHierarchicalDirPaths']
  validatePath: BaseStorageService['validatePath']
  validateDirName: BaseStorageService['validateDirName']
  validateFileName: BaseStorageService['validateFileName']
}

@Injectable()
class MockStorageServiceImpl extends BaseStorageService {}

export namespace MockStorageServiceDI {
  export const symbol = Symbol(MockStorageServiceImpl.name)
  export const provider = {
    provide: symbol,
    useClass: MockStorageServiceImpl,
  }
  export type type = MockStorageService
}
