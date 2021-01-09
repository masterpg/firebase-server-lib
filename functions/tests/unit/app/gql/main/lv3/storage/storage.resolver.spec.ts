import * as td from 'testdouble'
import {
  AppAdminUser,
  AppAdminUserHeader,
  GeneralUser,
  GeneralUserHeader,
  StorageTestHelper,
  StorageTestService,
  StorageUserHeader,
  StorageUserToken,
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

beforeAll(async () => {
  const testingModule = await Test.createTestingModule({
    imports: [DevUtilsServiceModule],
  }).compile()

  const devUtilsService = testingModule.get<DevUtilsServiceDI.type>(DevUtilsServiceDI.symbol)
  await devUtilsService.setTestFirebaseUsers(AppAdminUser(), GeneralUser())
})

describe('Lv3 Storage Resolver', () => {
  let app: any
  let storageService: StorageTestService
  let h!: StorageTestHelper

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
        mutation RemoveStorageDir($dirPath: String!) {
          removeStorageDir(dirPath: $dirPath)
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const d1 = h.newDirNode(`d1`)
      const removeDir = td.replace(storageService, 'removeDir')

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.removeStorageDir).toBeTruthy()

      const exp = td.explain(removeDir)
      expect(exp.calls.length).toBe(1)
      expect(exp.calls[0].args).toEqual([d1.path])
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = StorageService.toUserRootPath(StorageUserToken())
      const d1 = h.newDirNode(`${userRootPath}/d1`)
      const removeDir = td.replace(storageService, 'removeDir')

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.removeStorageDir).toBeTruthy()

      const exp = td.explain(removeDir)
      expect(exp.calls.length).toBe(1)
      expect(exp.calls[0].args).toEqual([d1.path])
    })

    it('サインインしていない場合', async () => {
      const d1 = h.newDirNode(`d1`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: d1.path },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d1 = h.newDirNode(`d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path },
        },
        { headers: StorageUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = StorageService.toUserRootPath(StorageUserToken())
      const d1 = h.newDirNode(`${userRootPath}/d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path },
        },
        { headers: GeneralUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
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

    it('疎通確認 - アプリケーションノード', async () => {
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
      expect(exp.calls[0].args).toEqual([`docs`, `archive/docs`])
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = StorageService.toUserRootPath(StorageUserToken())
      const moveDir = td.replace(storageService, 'moveDir')

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { fromDirPath: `${userRootPath}/docs`, toDirPath: `${userRootPath}/archive/docs` },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.moveStorageDir).toBeTruthy()

      const exp = td.explain(moveDir)
      expect(exp.calls.length).toBe(1)
      expect(exp.calls[0].args).toEqual([`${userRootPath}/docs`, `${userRootPath}/archive/docs`])
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, {
        ...gql,
        variables: { fromDirPath: `docs`, toDirPath: `archive/docs` },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { fromDirPath: `docs`, toDirPath: `archive/docs` },
        },
        { headers: StorageUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = StorageService.toUserRootPath(StorageUserToken())

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { fromDirPath: `${userRootPath}/docs`, toDirPath: `${userRootPath}/archive/docs` },
        },
        { headers: GeneralUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
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

    it('疎通確認 - アプリケーションノード', async () => {
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
      expect(exp.calls[0].args).toEqual([`documents`, `docs`])
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = StorageService.toUserRootPath(StorageUserToken())
      const renameDir = td.replace(storageService, 'renameDir')

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: `${userRootPath}/documents`, newName: `${userRootPath}/docs` },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.renameStorageDir).toBeTruthy()

      const exp = td.explain(renameDir)
      expect(exp.calls.length).toBe(1)
      expect(exp.calls[0].args).toEqual([`${userRootPath}/documents`, `${userRootPath}/docs`])
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: `documents`, newName: `docs` },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: `documents`, newName: `docs` },
        },
        { headers: StorageUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = StorageService.toUserRootPath(StorageUserToken())

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: `${userRootPath}/documents`, newName: `${userRootPath}/docs` },
        },
        { headers: GeneralUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })
})
