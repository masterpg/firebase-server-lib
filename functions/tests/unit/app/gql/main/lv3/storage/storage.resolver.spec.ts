import * as td from 'testdouble'
import {
  AppAdminUser,
  AppAdminUserHeader,
  AppAdminUserToken,
  GeneralUser,
  StorageTestHelper,
  StorageTestService,
  getGQLErrorStatus,
  requestGQL,
} from '../../../../../../helpers/app'
import { DevUtilsServiceDI, DevUtilsServiceModule, StorageService, StorageServiceDI } from '../../../../../../../src/app/services'
import { Test, TestingModule } from '@nestjs/testing'
import Lv3GQLContainerModule from '../../../../../../../src/app/gql/main/lv3'
import { initApp } from '../../../../../../../src/app/base'

jest.setTimeout(5000)
initApp()

//========================================================================
//
//  Tests
//
//========================================================================

describe('Lv3 Storage Resolver', () => {
  let app: any
  let storageService: StorageTestService
  let h!: StorageTestHelper

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [DevUtilsServiceModule],
    }).compile()

    const devUtilsService = testingModule.get<DevUtilsServiceDI.type>(DevUtilsServiceDI.symbol)
    await devUtilsService.setTestFirebaseUsers(AppAdminUser(), GeneralUser())
  })

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [Lv3GQLContainerModule],
    }).compile()

    app = module.createNestApplication()
    await app.init()
    storageService = module.get<StorageTestService>(StorageServiceDI.symbol)
    h = new StorageTestHelper(storageService)
  })

  describe('removeStorageDir', () => {
    const gql = {
      query: `
        mutation RemoveStorageDir($key: StorageNodeGetKeyInput!) {
          removeStorageDir(key: $key)
        }
      `,
    }

    it('疎通確認', async () => {
      const d1 = h.newDirNode(`d1`)
      const removeDir = td.replace(storageService, 'removeDir')

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { key: { path: d1.path } },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.removeStorageDir).toBeTruthy()

      const exp = td.explain(removeDir)
      expect(exp.calls.length).toBe(1)
      expect(exp.calls[0].args).toEqual([AppAdminUserToken(), { path: d1.path }])
    })

    it('サインインしていない場合', async () => {
      const d1 = h.newDirNode(`d1`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { key: { path: d1.path } },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('moveStorageDir', () => {
    const gql = {
      query: `
        mutation MoveStorageDir($fromDirPath: String!, $toDirPath: String!) {
          moveStorageDir(fromDirPath: $fromDirPath, toDirPath: $toDirPath)
        }
      `,
    }

    it('疎通確認', async () => {
      const moveDir = td.replace(storageService, 'moveDir')

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { fromDirPath: `docs`, toDirPath: `archive/docs` },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.moveStorageDir).toBeTruthy()

      const exp = td.explain(moveDir)
      expect(exp.calls.length).toBe(1)
      expect(exp.calls[0].args).toEqual([AppAdminUserToken(), `docs`, `archive/docs`])
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, {
        ...gql,
        variables: { fromDirPath: `docs`, toDirPath: `archive/docs` },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('renameStorageDir', () => {
    const gql = {
      query: `
        mutation RenameStorageDir($dirPath: String!, $newName: String!) {
          renameStorageDir(dirPath: $dirPath, newName: $newName)
        }
      `,
    }

    it('疎通確認', async () => {
      const renameDir = td.replace(storageService, 'renameDir')

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: `documents`, newName: `docs` },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.renameStorageDir).toBeTruthy()

      const exp = td.explain(renameDir)
      expect(exp.calls.length).toBe(1)
      expect(exp.calls[0].args).toEqual([AppAdminUserToken(), `documents`, `docs`])
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: `documents`, newName: `docs` },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })
})
