import { BaseStorageService } from '../../../../src/lib/services'
import { Injectable } from '@nestjs/common'

type MockStorageService = BaseStorageService & {
  toStorageNode: BaseStorageService['toStorageNode']
  toDirStorageNode: BaseStorageService['toDirStorageNode']
  sortStorageNodes: BaseStorageService['sortStorageNodes']
  padVirtualDirNode: BaseStorageService['padVirtualDirNode']
  splitHierarchicalDirPaths: BaseStorageService['splitHierarchicalDirPaths']
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
