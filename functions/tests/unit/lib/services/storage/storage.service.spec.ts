import * as admin from 'firebase-admin'
import * as fs from 'fs'
import * as path from 'path'
import * as td from 'testdouble'
import {
  AuthServiceDI,
  FirestoreServiceDI,
  InputValidationError,
  LibDevUtilsServiceDI,
  LibStorageService,
  LibStorageServiceDI,
  SignedUploadUrlInput,
  StorageNode,
  StorageNodeShareSettings,
  StorageNodeShareSettingsInput,
  StorageNodeType,
  StorageUser,
  UploadDataItem,
} from '../../../../../src/lib'
import { MockBaseAppModule, MockRESTContainerModule } from '../../../../mocks/lib'
import { Test, TestingModule } from '@nestjs/testing'
import { Module } from '@nestjs/common'
import { Response } from 'supertest'
import { config } from '../../../../../src/lib/base'
import { initLibTestApp } from '../../../../helpers/lib'
import { removeBothEndsSlash } from 'web-base-lib'
const dayjs = require('dayjs')
const request = require('supertest')
const cloneDeep = require('lodash/cloneDeep')

jest.setTimeout(25000)
initLibTestApp()

//========================================================================
//
//  Test data
//
//========================================================================

const STORAGE_TEST_USER: StorageUser = { uid: 'storage.test.user', myDirName: 'storage.test.user' }

const APP_ADMIN_USER = { uid: 'app.admin.user', myDirName: 'app.admin.user', isAppAdmin: true }

const TEST_FILES_DIR = 'test-files'

const EMPTY_SHARE_SETTINGS: StorageNodeShareSettings = {
  isPublic: false,
  uids: [],
}

//========================================================================
//
//  Test helpers
//
//========================================================================

let storageService!: TestStorageService

let devUtilsService!: LibDevUtilsServiceDI.type

type TestStorageService = LibStorageService & {
  toStorageNode: LibStorageService['toStorageNode']
  toStorageNodeByDir: LibStorageService['toStorageNodeByDir']
  sortStorageNodes: LibStorageService['sortStorageNodes']
  padVirtualDirNode: LibStorageService['padVirtualDirNode']
  splitHierarchicalDirPaths: LibStorageService['splitHierarchicalDirPaths']
  validatePath: LibStorageService['validatePath']
  validateDirName: LibStorageService['validateDirName']
  validateFileName: LibStorageService['validateFileName']
}

/**
 * 指定された`StorageNode`自体の検証と、対象のノードがCloud Storageに存在することを検証します。
 * @param nodes
 * @param basePath
 */
async function existsNodes(nodes: StorageNode[], basePath = ''): Promise<void> {
  const bucket = admin.storage().bucket()
  for (const node of nodes) {
    // ディレクトリの末尾が'/'でないことを検証
    expect(node.dir.endsWith('/')).toBeFalsy()
    // node.path が ｢node.dir + node.name｣ と一致することを検証
    expect(node.path).toBe(path.join(node.dir, node.name))
    // Cloud Storageに対象のノードが存在することを検証
    let nodePath = basePath ? `${removeBothEndsSlash(basePath)}/${node.path}` : node.path
    nodePath += node.nodeType === StorageNodeType.Dir ? '/' : ''
    const gcsNode = bucket.file(nodePath)
    const exists = (await gcsNode.exists())[0]
    expect(exists).toBeTruthy()
  }
}

/**
 * 指定された`StorageNode`自体の検証と、対象のノードがCloud Storageに存在しないことを検証します。
 * @param nodes
 * @param basePath
 */
async function notExistsNodes(nodes: StorageNode[], basePath = ''): Promise<void> {
  const bucket = admin.storage().bucket()
  for (const node of nodes) {
    // ディレクトリの末尾が'/'でないことを検証
    expect(node.dir.endsWith('/')).toBeFalsy()
    // node.path が ｢node.dir + node.name｣ と一致することを検証
    expect(node.path).toBe(path.join(node.dir, node.name))
    // Cloud Storageに対象のノードが存在しないことを検証
    let nodePath = basePath ? `${removeBothEndsSlash(basePath)}/${node.path}` : node.path
    nodePath += node.nodeType === StorageNodeType.Dir ? '/' : ''
    const gcsNode = bucket.file(nodePath)
    const exists = (await gcsNode.exists())[0]
    expect(exists).toBeFalsy()
  }
}

/**
 * テスト結果として取得されたノードを再度取得し直します。
 * @param nodes
 * @param basePath
 */
async function getNodesByActualNodes(nodes: StorageNode[], basePath = ''): Promise<StorageNode[]> {
  const promises: Promise<StorageNode>[] = []
  for (const node of nodes) {
    switch (node.nodeType) {
      case StorageNodeType.Dir:
        promises.push(storageService.getDirNode(node.path, basePath))
        break
      case StorageNodeType.File:
        promises.push(storageService.getFileNode(node.path, basePath))
        break
    }
  }
  const result = await Promise.all(promises)
  return storageService.sortStorageNodes(result)
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  }) as Promise<void>
}

//========================================================================
//
//  Tests
//
//========================================================================

describe('StorageService', () => {
  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [LibDevUtilsServiceDI.provider, FirestoreServiceDI.provider, AuthServiceDI.provider, LibStorageServiceDI.provider],
    }).compile()

    storageService = module.get<TestStorageService>(LibStorageServiceDI.symbol)
    devUtilsService = module.get<LibDevUtilsServiceDI.type>(LibDevUtilsServiceDI.symbol)

    await storageService.removeDirs([`${TEST_FILES_DIR}`])
    await storageService.removeDirs([`${storageService.getUserDirPath(STORAGE_TEST_USER)}/`])

    // Cloud Storageで短い間隔のノード追加・削除を行うとエラーが発生するので間隔調整している
    await sleep(1000)
  })

  describe('getDirAndDescendants', () => {
    it('ディレクトリを作成した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d1/d12`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileC.txt`,
          toFilePath: `${TEST_FILES_DIR}/fileC.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/d12/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.getDirAndDescendants(`${TEST_FILES_DIR}`)

      expect(actual.length).toBe(7)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
      expect(actual[4].path).toBe(`${TEST_FILES_DIR}/d1/d12`)
      expect(actual[5].path).toBe(`${TEST_FILES_DIR}/d1/d12/fileB.txt`)
      expect(actual[6].path).toBe(`${TEST_FILES_DIR}/fileC.txt`)
    })

    it('ディレクトリを作成しなかった', async () => {
      // ディレクトリを作成せずファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileC.txt`,
          toFilePath: `${TEST_FILES_DIR}/fileC.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/d12/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.getDirAndDescendants(`${TEST_FILES_DIR}`)

      expect(actual.length).toBe(7)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
      expect(actual[4].path).toBe(`${TEST_FILES_DIR}/d1/d12`)
      expect(actual[5].path).toBe(`${TEST_FILES_DIR}/d1/d12/fileB.txt`)
      expect(actual[6].path).toBe(`${TEST_FILES_DIR}/fileC.txt`)
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}`, `${TEST_FILES_DIR}/d1/d11`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileC.txt`,
          toFilePath: `${TEST_FILES_DIR}/fileC.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.getDirAndDescendants(`d1/d11`, `${TEST_FILES_DIR}`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/fileA.txt`)
      // 'fileC.txt'は取得されない
    })

    it('basePathを指定した場合 - dirPathが空の場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1/d11`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileC.txt`,
          toFilePath: `${TEST_FILES_DIR}/fileC.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.getDirAndDescendants('', `${TEST_FILES_DIR}`)

      expect(actual.length).toBe(4)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/fileA.txt`)
      // 'fileC.txt'は取得される
      expect(actual[3].path).toBe(`fileC.txt`)
    })

    it(`dirPath、basePathの先頭・末尾に'/'を付与`, async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `/${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // パスの先頭・末尾に'/'を付与
      const actual = await storageService.getDirAndDescendants('/d1/', `/${TEST_FILES_DIR}/`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/fileA.txt`)
    })
  })

  describe('getUserDirAndDescendants', () => {
    it('ディレクトリを指定しない場合', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `d1/d11/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `d1/d12/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList, `${userDirPath}`)

      const actual = await storageService.getUserDirAndDescendants(STORAGE_TEST_USER)

      expect(actual.length).toBe(5)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/fileA.txt`)
      expect(actual[3].path).toBe(`d1/d12`)
      expect(actual[4].path).toBe(`d1/d12/fileB.txt`)
    })

    it('ディレクトリを指定した場合', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `d1/d11/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `d1/d12/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList, `${userDirPath}`)

      const actual = await storageService.getUserDirAndDescendants(STORAGE_TEST_USER, `d1/d11`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/fileA.txt`)
    })
  })

  describe('createDirs', () => {
    it('ベーシックケース', async () => {
      const actual = await storageService.createDirs([
        `${TEST_FILES_DIR}/d3`,
        `${TEST_FILES_DIR}/d1/d11`,
        `${TEST_FILES_DIR}/d1/d12`,
        `${TEST_FILES_DIR}/d2/d21`,
      ])

      expect(actual.length).toBe(7)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[3].path).toBe(`${TEST_FILES_DIR}/d1/d12`)
      expect(actual[4].path).toBe(`${TEST_FILES_DIR}/d2`)
      expect(actual[5].path).toBe(`${TEST_FILES_DIR}/d2/d21`)
      expect(actual[6].path).toBe(`${TEST_FILES_DIR}/d3`)
      await existsNodes(actual)
    })

    it('既に存在するディレクトリを作成しようとした場合', async () => {
      const d1 = (await storageService.createDirs([`d1`], `${TEST_FILES_DIR}`))[0]

      const actual = await storageService.createDirs([`d1`], `${TEST_FILES_DIR}`)

      expect(actual.length).toBe(0)
      const afterD1 = await storageService.getDirNode(`d1`, `${TEST_FILES_DIR}`)
      expect(d1.created).toEqual(afterD1.created)
      expect(d1.updated).toEqual(afterD1.updated)
    })

    it('basePathを指定した場合', async () => {
      const actual = await storageService.createDirs([`d3`, `d1/d11`, `d1/d12`, `d2/d21`], `${TEST_FILES_DIR}`)

      expect(actual.length).toBe(6)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d12`)
      expect(actual[3].path).toBe(`d2`)
      expect(actual[4].path).toBe(`d2/d21`)
      expect(actual[5].path).toBe(`d3`)
      await existsNodes(actual, `${TEST_FILES_DIR}`)
    })

    it(`dirPaths、basePathの先頭・末尾に'/'を付与`, async () => {
      // パスの先頭・末尾に'/'を付与
      const actual = await storageService.createDirs([`/d3/`, `/d1/d11/`, `/d1/d12/`, `/d2/d21/`], `/${TEST_FILES_DIR}/`)

      expect(actual.length).toBe(6)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d12`)
      expect(actual[3].path).toBe(`d2`)
      expect(actual[4].path).toBe(`d2/d21`)
      expect(actual[5].path).toBe(`d3`)
      await existsNodes(actual, `/${TEST_FILES_DIR}/`)
    })

    it('作成ディレクトリパスへのバリデーション実行確認', async () => {
      const validatePath = td.replace(storageService, 'validatePath')

      await storageService.createDirs([`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      const explanation = td.explain(validatePath)
      expect(explanation.calls.length).toBe(2)
      expect(explanation.calls[0].args[0]).toBe(`${TEST_FILES_DIR}/d1`)
      expect(explanation.calls[1].args[0]).toBe(`${TEST_FILES_DIR}/d2`)
    })

    it('共有設定', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1/d12`])
      // 'd1'ディレクトリに共有設定しておく
      const d1Settings: StorageNodeShareSettings = { isPublic: true, uids: ['ichiro'] }
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, d1Settings)
      // 'd1/d12'ディレクトリに共有設定しておく
      const d12Settings: StorageNodeShareSettings = { isPublic: true, uids: ['juniro'] }
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1/d12`, d12Settings)

      // 'd1/d11', 'd1/d11/d111', 'd1/d12/d121', 'd2' ディレクトリを作成
      const actual = await storageService.createDirs([`${TEST_FILES_DIR}/d1/d11/d111`, `${TEST_FILES_DIR}/d1/d12/d121`, `${TEST_FILES_DIR}/d2`])

      expect(actual.length).toBe(4)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1/d11/d111`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d12/d121`)
      expect(actual[3].path).toBe(`${TEST_FILES_DIR}/d2`)

      expect(actual[0].share).toEqual(d1Settings)
      expect(actual[1].share).toEqual(d1Settings)
      expect(actual[2].share).toEqual(d12Settings)
      expect(actual[3].share).toEqual(EMPTY_SHARE_SETTINGS)

      await existsNodes(actual)
    })

    it('共有設定 - basePathを指定した場合', async () => {
      // 'd1'ディレクトリを作成しておく
      await storageService.createDirs([`d1`], `${TEST_FILES_DIR}`)
      // 'd1'ディレクトリに共有設定しておく
      const d1Settings: StorageNodeShareSettings = { isPublic: true, uids: ['ichiro'] }
      await storageService.setDirShareSettings(`d1`, d1Settings, `${TEST_FILES_DIR}`)

      // 'd1/d11'ディレクトリを作成
      const actual = await storageService.createDirs([`d1/d11`], `${TEST_FILES_DIR}`)

      expect(actual.length).toBe(1)
      expect(actual[0].path).toBe(`d1/d11`)
      expect(actual[0].share).toEqual(d1Settings)

      await existsNodes(actual, `${TEST_FILES_DIR}`)
    })
  })

  describe('handleUploadedFiles', () => {
    it('ディレクトリ作成と共有設定', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1/d12`])
      // 'd1'ディレクトリに共有設定しておく
      const d1Settings: StorageNodeShareSettings = { isPublic: true, uids: ['ichiro'] }
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, d1Settings)
      // 'd1/d12'ディレクトリに共有設定しておく
      const d12Settings: StorageNodeShareSettings = { isPublic: true, uids: ['juniro'] }
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1/d12`, d12Settings)

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d12/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems)

      // ファイルアップロードの後処理を実行
      const actual = await storageService.handleUploadedFiles(uploadItems.map(item => item.path))

      expect(actual.length).toBe(3)
      // 'd1/d11'ディレクトリが作成された
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d12/fileB.txt`)

      expect(actual[0].share).toEqual(d1Settings)
      expect(actual[1].share).toEqual(d1Settings)
      expect(actual[2].share).toEqual(d12Settings)

      await existsNodes(actual)
    })

    it('ディレクトリ作成と共有設定 - basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`d1`], `${TEST_FILES_DIR}`)
      // 'd1'ディレクトリに共有設定しておく
      const d1Settings: StorageNodeShareSettings = { isPublic: true, uids: ['ichiro'] }
      await storageService.setDirShareSettings(`d1`, d1Settings, `${TEST_FILES_DIR}`)

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems, `${TEST_FILES_DIR}`)

      // ファイルアップロードの後処理を実行
      const actual = await storageService.handleUploadedFiles(
        uploadItems.map(item => item.path),
        `${TEST_FILES_DIR}`
      )

      expect(actual.length).toBe(2)
      // 'd1/d11'ディレクトリが作成された
      expect(actual[0].path).toBe(`d1/d11`)
      expect(actual[1].path).toBe(`d1/d11/fileA.txt`)

      expect(actual[0].share).toEqual(d1Settings)
      expect(actual[1].share).toEqual(d1Settings)

      await existsNodes(actual, `${TEST_FILES_DIR}`)
    })

    it('ファイルパスへのバリデーション実行確認', async () => {
      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d2/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems)

      const validatePath = td.replace(storageService, 'validatePath')

      await storageService.handleUploadedFiles([`${TEST_FILES_DIR}/d1/fileA.txt`, `${TEST_FILES_DIR}/d2/fileB.txt`])

      const explanation = td.explain(validatePath)
      expect(explanation.calls.length).toBe(2)
      expect(explanation.calls[0].args[0]).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(explanation.calls[1].args[0]).toBe(`${TEST_FILES_DIR}/d2/fileB.txt`)
    })

    it('存在しないファイルを指定した場合', async () => {
      let actual: Error
      try {
        await storageService.handleUploadedFiles([`${TEST_FILES_DIR}/d1/fileA.txt`])
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`Uploaded file not found: '${TEST_FILES_DIR}/d1/fileA.txt'`)
    })
  })

  describe('handleUploadedUserFiles', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)

      // ディレクトリを作成
      await storageService.createDirs([`d1`], `${userDirPath}`)
      // 'd1'ディレクトリに共有設定しておく
      const d1Settings: StorageNodeShareSettings = { isPublic: true, uids: ['ichiro'] }
      await storageService.setDirShareSettings(`d1`, d1Settings, `${userDirPath}`)

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems, `${userDirPath}`)

      // ファイルアップロードの後処理を実行
      const actual = await storageService.handleUploadedUserFiles(
        STORAGE_TEST_USER,
        uploadItems.map(item => item.path)
      )

      expect(actual.length).toBe(2)
      // 'd1/d11'ディレクトリが作成された
      expect(actual[0].path).toBe(`d1/d11`)
      expect(actual[1].path).toBe(`d1/d11/fileA.txt`)

      expect(actual[0].share).toEqual(d1Settings)
      expect(actual[1].share).toEqual(d1Settings)

      await existsNodes(actual, `${userDirPath}`)
    })
  })

  describe('createUserDirs', () => {
    it('ベーシックケース', async () => {
      const actual = await storageService.createUserDirs(STORAGE_TEST_USER, [`d3`, `d1/d11`, `d1/d12`, `d2/d21`])

      expect(actual.length).toBe(6)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d12`)
      expect(actual[3].path).toBe(`d2`)
      expect(actual[4].path).toBe(`d2/d21`)
      expect(actual[5].path).toBe(`d3`)
      const userDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)
      await existsNodes(actual, `${userDirPath}`)
    })
  })

  describe('removeDirs', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.removeDirs([`${TEST_FILES_DIR}/d1`])

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/fileB.txt`)
      await notExistsNodes(actual)
    })

    it(`'d1/d11'と親である'd1'を同時に指定した場合`, async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d1/d12`, `${TEST_FILES_DIR}/d2/d21`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/d12/fileB.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileC.txt`,
          toFilePath: `${TEST_FILES_DIR}/d2/d21/fileC.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // 'd1/d11'と親である'd1'を同時に指定してみる
      const actual = await storageService.removeDirs([`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2/d21`])

      expect(actual.length).toBe(7)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
      expect(actual[3].path).toBe(`${TEST_FILES_DIR}/d1/d12`)
      expect(actual[4].path).toBe(`${TEST_FILES_DIR}/d1/d12/fileB.txt`)
      expect(actual[5].path).toBe(`${TEST_FILES_DIR}/d2/d21`)
      expect(actual[6].path).toBe(`${TEST_FILES_DIR}/d2/d21/fileC.txt`)
      await notExistsNodes(actual)
    })

    it('ファイルに対するディレクトリがないディレクトリを指定した場合', async () => {
      // ディレクトリを作成せずファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.removeDirs([`${TEST_FILES_DIR}/d1`])

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1/fileB.txt`)
      await notExistsNodes(actual)
    })

    it('ディレクトリの一部が存在しない場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1/d11/d111`])

      // ディレクトリ階層の中間のディレクトリを削除する
      const d11 = await storageService.getDirNode(`${TEST_FILES_DIR}/d1/d11`)
      await d11.gcsNode.delete()

      const actual = await storageService.removeDirs([`${TEST_FILES_DIR}/d1`])

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1/d11/d111`)
      await notExistsNodes(actual)
    })

    it('存在しないディレクトリを指定した場合', async () => {
      const actual = await storageService.removeDirs([`${TEST_FILES_DIR}/d1`])

      expect(actual.length).toBe(0)
    })

    it(`dirPathの先頭・末尾に'/'を付与`, async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // パスの先頭・末尾に'/'を付与
      const actual = await storageService.removeDirs([`/${TEST_FILES_DIR}/d1/`])

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1/fileB.txt`)
      await notExistsNodes(actual)
    })

    it('basePathを指定した場合', async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.removeDirs([`d1`], `${TEST_FILES_DIR}`)

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`d1/fileA.txt`)
      expect(actual[1].path).toBe(`d1/fileB.txt`)
      await notExistsNodes(actual, `${TEST_FILES_DIR}`)
    })

    it('dirPathsに空文字が含まれている場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // 空文字を指定
      const actual = await storageService.removeDirs(['', undefined, null as any])

      // 何も行われないことを検証
      expect(actual.length).toBe(0)
    })
  })

  describe('removeUserDirs', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)

      // ディレクトリを作成
      await storageService.createDirs([`d1`], `${userDirPath}`)

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `d1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `d1/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList, `${userDirPath}`)

      const actual = await storageService.removeUserDirs(STORAGE_TEST_USER, [`d1`])

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/fileA.txt`)
      expect(actual[2].path).toBe(`d1/fileB.txt`)
      await notExistsNodes(actual, `${userDirPath}`)
    })
  })

  describe('removeFiles', () => {
    it('ベーシックケース', async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/d2/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.removeFiles([`${TEST_FILES_DIR}/d1/fileA.txt`, `${TEST_FILES_DIR}/d2/fileB.txt`])

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d2/fileB.txt`)
      await notExistsNodes(actual)
    })

    it('basePathを指定した場合', async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/d2/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.removeFiles([`d1/fileA.txt`, `d2/fileB.txt`], `${TEST_FILES_DIR}`)

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`d1/fileA.txt`)
      expect(actual[1].path).toBe(`d2/fileB.txt`)
      await notExistsNodes(actual, `${TEST_FILES_DIR}`)
    })

    it(`filePaths、basePathの先頭・末尾に'/'を付与`, async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/d2/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // パスの先頭・末尾に'/'を付与
      const actual = await storageService.removeFiles([`/d1/fileA.txt/`, `/d2/fileB.txt/`], `/${TEST_FILES_DIR}/`)

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`d1/fileA.txt`)
      expect(actual[1].path).toBe(`d2/fileB.txt`)
      await notExistsNodes(actual, `${TEST_FILES_DIR}`)
    })

    it('存在しないファイルを指定', async () => {
      const actual = await storageService.removeFiles([`${TEST_FILES_DIR}/d1/fileXXX.txt`])

      expect(actual.length).toBe(0)
    })

    it('filePathsに空文字が含まれている場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // 空文字を指定
      const actual = await storageService.removeFiles(['', undefined, null as any])

      // 何も行われないことを検証
      expect(actual.length).toBe(0)
    })
  })

  describe('removeUserFiles', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)

      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `d1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `d2/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList, `${userDirPath}`)

      const actual = await storageService.removeUserFiles(STORAGE_TEST_USER, [`d1/fileA.txt`, `d2/fileB.txt`])

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`d1/fileA.txt`)
      expect(actual[1].path).toBe(`d2/fileB.txt`)
      await notExistsNodes(actual, `${userDirPath}`)
    })
  })

  describe('moveDir', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // 'd1'を'd2/d1'へ移動
      const fromDirNodes: StorageNode[] = []
      fromDirNodes.push(await storageService.getDirNode(`${TEST_FILES_DIR}/d1`))
      fromDirNodes.push(await storageService.getDirNode(`${TEST_FILES_DIR}/d1/d11`))
      fromDirNodes.push(await storageService.getDirNode(`${TEST_FILES_DIR}/d1/d11/file1.txt`))
      const actual = await storageService.moveDir(fromDirNodes[0].path, `${TEST_FILES_DIR}/d2/d1`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d2/d1`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d2/d1/d11`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d2/d1/d11/fileA.txt`)
      await existsNodes(actual)
      await notExistsNodes(fromDirNodes)
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`d1/d11`, `d2`], `${TEST_FILES_DIR}`)

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // 'd1'を'd2/d1'へ移動
      const fromDirNodes: StorageNode[] = []
      fromDirNodes.push(await storageService.getDirNode(`d1`, `${TEST_FILES_DIR}`))
      fromDirNodes.push(await storageService.getDirNode(`d1/d11`, `${TEST_FILES_DIR}`))
      fromDirNodes.push(await storageService.getDirNode(`d1/d11/file1.txt`, `${TEST_FILES_DIR}`))
      const actual = await storageService.moveDir(fromDirNodes[0].path, `d2/d1`, `${TEST_FILES_DIR}`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d2/d1`)
      expect(actual[1].path).toBe(`d2/d1/d11`)
      expect(actual[2].path).toBe(`d2/d1/d11/fileA.txt`)
      await existsNodes(actual, `${TEST_FILES_DIR}`)
      await notExistsNodes(fromDirNodes, `${TEST_FILES_DIR}`)
    })

    it(`basePathを指定した場合 - fromDirPath、toDirPath、basePathの先頭・末尾に'/'を付与`, async () => {
      // ディレクトリを作成
      await storageService.createDirs([`d1/d11`, `d2`], `${TEST_FILES_DIR}`)

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // 'd1'を'd2/d1'へ移動
      // パスの先頭・末尾に'/'を付与
      const fromDirNodes: StorageNode[] = []
      fromDirNodes.push(await storageService.getDirNode(`d1`, `${TEST_FILES_DIR}`))
      fromDirNodes.push(await storageService.getDirNode(`d1/d11`, `${TEST_FILES_DIR}`))
      fromDirNodes.push(await storageService.getDirNode(`d1/d11/file1.txt`, `${TEST_FILES_DIR}`))
      const actual = await storageService.moveDir(fromDirNodes[0].path, `/d2/d1/`, `/${TEST_FILES_DIR}/`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d2/d1`)
      expect(actual[1].path).toBe(`d2/d1/d11`)
      expect(actual[2].path).toBe(`d2/d1/d11/fileA.txt`)
      await existsNodes(actual, `${TEST_FILES_DIR}`)
      await notExistsNodes(fromDirNodes, `${TEST_FILES_DIR}`)
    })

    it('移動先に同名のディレクトリが存在する場合', async () => {
      // ディレクトリを作成
      // ('d1'と'd2'配下に'docs'を作成)
      await storageService.createDirs([`${TEST_FILES_DIR}/d1/docs`, `${TEST_FILES_DIR}/d2/docs`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/docs/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/d2/docs/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // 'd1/docs'を'd2/docs'へ移動
      const fromDirNodes: StorageNode[] = []
      fromDirNodes.push(await storageService.getDirNode(`${TEST_FILES_DIR}/d1/docs`))
      fromDirNodes.push(await storageService.getFileNode(`${TEST_FILES_DIR}/d1/docs/fileA.txt`))
      const actual = await storageService.moveDir(fromDirNodes[0].path, `${TEST_FILES_DIR}/d2/docs`)

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d2/docs`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d2/docs/fileA.txt`)
      await existsNodes(actual)
      await notExistsNodes(fromDirNodes)

      const docsDirNodes = await storageService.getDirAndDescendants(`d2/docs`, `${TEST_FILES_DIR}`)
      expect(docsDirNodes.length).toBe(4)
      expect(docsDirNodes[0].path).toBe(`d2`)
      expect(docsDirNodes[1].path).toBe(`d2/docs`)
      expect(docsDirNodes[2].path).toBe(`d2/docs/fileA.txt`)
      expect(docsDirNodes[3].path).toBe(`d2/docs/fileB.txt`)
    })

    it('移動先に同名のファイルが存在する場合', async () => {
      // ディレクトリを作成
      // ('d1'と'd2'配下に'docs'を作成)
      await storageService.createDirs([`${TEST_FILES_DIR}/d1/docs`, `${TEST_FILES_DIR}/d2/docs`])

      // 作成したディレクトリにファイルをアップロード
      // 'd1'と'd2'配下に'file.txt'を配置
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/docs/file.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d2/docs/file.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems)

      const fromDirNodes: StorageNode[] = []
      fromDirNodes.push(await storageService.getDirNode(`${TEST_FILES_DIR}/d1/docs`))
      fromDirNodes.push(await storageService.getFileNode(`${TEST_FILES_DIR}/d1/docs/file.txt`))
      const actual = await storageService.moveDir(fromDirNodes[0].path, `${TEST_FILES_DIR}/d2/docs`)

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d2/docs`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d2/docs/file.txt`)
      await existsNodes(actual)
      await notExistsNodes(fromDirNodes)

      const fileNode = await storageService.getFileNode(`${TEST_FILES_DIR}/d2/docs/file.txt`)
      const fileData = await fileNode.gcsNode.download()
      expect(fileData.toString()).toBe('testA')
    })

    it('移動元と移動先が同じ場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      let actual: Error
      try {
        const fromDirNode = await storageService.getDirNode(`${TEST_FILES_DIR}/d1`)
        await storageService.moveDir(fromDirNode.path, fromDirNode.path + '/') // 移動先に''を付けて試す
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The source and destination are the same: '${TEST_FILES_DIR}/d1' -> '${TEST_FILES_DIR}/d1'`)
    })

    it('移動元ディレクトリのサブディレクトリが実際には存在しない場合', async () => {
      // ディレクトリを作成
      // (移動元のサブディレクトリは作成しない)
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          // 'd11'といディレクトリは存在しないがアップロードはできる
          toFilePath: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // 'd1'を'd2/d1'へ移動
      const fromDirNodes: StorageNode[] = []
      fromDirNodes.push(await storageService.getDirNode(`${TEST_FILES_DIR}/d1`))
      fromDirNodes.push(await storageService.getDirNode(`${TEST_FILES_DIR}/d1/d11/file1.txt`))
      const actual = await storageService.moveDir(fromDirNodes[0].path, `${TEST_FILES_DIR}/d2/d1`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d2/d1`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d2/d1/d11`) // ← 移動元に存在しなかったディレクトリが作成されている
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d2/d1/d11/fileA.txt`)
      await existsNodes(actual)
      await notExistsNodes(fromDirNodes)
    })

    it('移動元ディレクトリが存在しない場合', async () => {
      // ディレクトリを作成
      // (移動元ディレクトリは作成しない)
      await storageService.createDirs([`${TEST_FILES_DIR}/d2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      let actual: Error
      try {
        const fromDirNode = await storageService.getDirNode(`${TEST_FILES_DIR}/d1`)
        await storageService.moveDir(fromDirNode.path, `${TEST_FILES_DIR}/d2/d1`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The source directory does not exist: '${TEST_FILES_DIR}/d1'`)
    })

    it('移動先ディレクトリが存在しない場合', async () => {
      // ディレクトリを作成
      // (移動先ディレクトリ'd2'は作成しない)
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // 存在しない'd2'配下へ'd1'を移動させる
      let actual: Error
      try {
        const fromDirNode = await storageService.getDirNode(`d1`, `${TEST_FILES_DIR}`)
        await storageService.moveDir(fromDirNode.path, `d2/d1`, `${TEST_FILES_DIR}`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The destination directory does not exist: '${TEST_FILES_DIR}/d2'`)
    })

    it('移動先ディレクトリが存在しない場合 - ルートディレクトリ(アプリケーションまたはユーザーディレクトリ)直下へ移動する場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1/docs`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/docs/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // ルートディレクトリ(アプリケーションまたはユーザーディレクトリ)直下へ移動
      // 'd1/docs'をルートディレクトリ直下'docs'へ移動
      const fromDirNodes: StorageNode[] = []
      fromDirNodes.push(await storageService.getDirNode(`d1/docs`, `${TEST_FILES_DIR}`))
      fromDirNodes.push(await storageService.getDirNode(`d1/docs/fileA.txt`, `${TEST_FILES_DIR}`))
      const actual = await storageService.moveDir(fromDirNodes[0].path, `docs`, `${TEST_FILES_DIR}`)

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`docs`)
      expect(actual[1].path).toBe(`docs/fileA.txt`)
      await existsNodes(actual, `${TEST_FILES_DIR}`)
      await notExistsNodes(fromDirNodes, `${TEST_FILES_DIR}`)
    })

    it('移動先ディレクトリが移動元のサブディレクトリの場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      let actual: Error
      try {
        const fromDirNode = await storageService.getDirNode(`${TEST_FILES_DIR}/d1`)
        await storageService.moveDir(fromDirNode.path, `${TEST_FILES_DIR}/d1/aaa/bbb/d1`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The destination directory is its own subdirectory: '${TEST_FILES_DIR}/d1' -> '${TEST_FILES_DIR}/d1/aaa/bbb/d1'`)
    })

    it(`移動先ディレクトリが移動元のサブディレクトリの場合 - fromDirPath、toDirPathの先頭・末尾に'/'を付与`, async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      let actual: Error
      try {
        // パスの先頭・末尾に'/'を付与
        const fromDirNode = await storageService.getDirNode(`/${TEST_FILES_DIR}/d1/`)
        await storageService.moveDir(fromDirNode.path, `/${TEST_FILES_DIR}/d1/aaa/bbb/d1/`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The destination directory is its own subdirectory: '${TEST_FILES_DIR}/d1' -> '${TEST_FILES_DIR}/d1/aaa/bbb/d1'`)
    })

    it('移動先ディレクトリパスへのバリデーション実行確認', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // バリデーションメソッドのモック化
      const validatePath = td.replace(storageService, 'validatePath')

      await storageService.moveDir(`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`)

      const explanation = td.explain(validatePath)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(`${TEST_FILES_DIR}/d2`)
    })

    it('共有設定 - 移動元ディレクトリの共有設定はなく、かつ移動先ディレクトリは公開フラグがオンの場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems)

      // 移動先'd2'の公開フラグをオンにしておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d2`, { isPublic: true })

      // 'd1/d11'を'd2/d11'へ移動
      const actual = await storageService.moveDir(`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2/d11`)

      const verify = (nodes: StorageNode[]) => {
        expect(nodes.length).toBe(2)
        expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/d2/d11`)
        expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/d2/d11/fileA.txt`)

        for (const node of nodes) {
          // 移動先'd2'の公開フラグ(オン)が適用されていることを検証
          expect(node.share).toEqual({ isPublic: true, uids: [] } as StorageNodeShareSettings)
        }
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual))
    })

    it('共有設定 - 移動元ディレクトリの公開フラグがオンで、かつ移動先ディレクトリの公開フラグもオンの場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems)

      // 移動元'd1'の公開フラグをオンにしておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { isPublic: true })

      // 移動先'd2'の公開フラグをオンにしておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d2`, { isPublic: true })

      // 'd1/d11'を'd2/d11'へ移動
      const actual = await storageService.moveDir(`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2/d11`)

      const verify = (nodes: StorageNode[]) => {
        expect(nodes.length).toBe(2)
        expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/d2/d11`)
        expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/d2/d11/fileA.txt`)

        for (const node of nodes) {
          // 移動先'd2'の公開フラグ(オン)が適用されていることを検証
          expect(node.share).toEqual({ isPublic: true, uids: [] } as StorageNodeShareSettings)
        }
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual))
    })

    it('共有設定 - 移動元ディレクトリの公開フラグがオンで、かつ移動先ディレクトリの公開フラグもオフの場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems)

      // 移動元'd1'の公開フラグをオンにしておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { isPublic: true })

      // 移動先'd2'の公開フラグをオフにしておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d2`, { isPublic: false })

      // 'd1/d11'を'd2/d11'へ移動
      const actual = await storageService.moveDir(`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2/d11`)

      const verify = (nodes: StorageNode[]) => {
        expect(nodes.length).toBe(2)
        expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/d2/d11`)
        expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/d2/d11/fileA.txt`)

        for (const node of nodes) {
          // 移動先'd2'の公開フラグ(オフ)が適用されていることを検証
          expect(node.share).toEqual(EMPTY_SHARE_SETTINGS)
        }
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual))
    })

    it('共有設定 - 移動元ディレクトリの公開フラグがオフで、かつ移動先ディレクトリの公開フラグがオンの場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems)

      // 移動元'd1'の公開フラグをオフにしておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { isPublic: false })

      // 移動先'd2'の公開フラグをオンにしておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d2`, { isPublic: true })

      // 'd1/d11'を'd2/d11'へ移動
      const actual = await storageService.moveDir(`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2/d11`)

      const verify = (nodes: StorageNode[]) => {
        expect(nodes.length).toBe(2)
        expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/d2/d11`)
        expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/d2/d11/fileA.txt`)

        for (const node of nodes) {
          // 移動先'd2'の公開フラグ(オン)が適用されていることを検証
          expect(node.share).toEqual({ isPublic: true, uids: [] } as StorageNodeShareSettings)
        }
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual))
    })

    it('共有設定 - 移動元ディレクトリの公開フラグがオフで、かつ配下に公開フラグがオンのノードがあり、かつ移動先ディレクトリの公開フラグがオフの場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems)

      // 移動元'd1'の公開フラグをオフにしておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { isPublic: false })
      // 移動元'd1'配下ノードの公開フラグをオンにしておく
      await storageService.setFileShareSettings(`${TEST_FILES_DIR}/d1/d11/fileA.txt`, { isPublic: true })
      // 移動先'd2'の公開フラグをオフにしておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d2`, { isPublic: false })

      // 'd1/d11'を'd2/d11'へ移動
      const actual = await storageService.moveDir(`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2/d11`)

      const verify = (nodes: StorageNode[]) => {
        expect(nodes.length).toBe(2)
        expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/d2/d11`)
        expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/d2/d11/fileA.txt`)

        expect(nodes[0].share).toEqual(EMPTY_SHARE_SETTINGS)
        // 'fileA.txt'に設定された公開フラグが維持されていることを検証
        expect(nodes[1].share).toEqual({ isPublic: true, uids: [] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual))
    })

    it('共有設定 - 移動元ディレクトリに共有設定はなく、かつ移動先ディレクトリにユーザーIDの共有設定がある場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems)

      // 移動先'd2'にユーザーIDの共有設定をしておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d2`, { uids: ['jiro'] })

      // 'd1/d11'を'd2/d11'へ移動
      const actual = await storageService.moveDir(`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2/d11`)

      const verify = (nodes: StorageNode[]) => {
        expect(nodes.length).toBe(2)
        expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/d2/d11`)
        expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/d2/d11/fileA.txt`)

        for (const node of nodes) {
          // 移動先'd2'のユーザーIDが適用されていることを検証
          expect(node.share).toEqual({ isPublic: false, uids: ['jiro'] } as StorageNodeShareSettings)
        }
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual))
    })

    it('共有設定 - 移動元ディレクトリにユーザーIDの共有設定があり、かつ移動先ディレクトリにユーザーIDの共有設定がない場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems)

      // 'd1'にユーザーIDの共有設定をしておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })

      // 'd1/d11'を'd2/d11'へ移動
      const actual = await storageService.moveDir(`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2/d11`)

      const verify = (nodes: StorageNode[]) => {
        expect(nodes.length).toBe(2)
        expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/d2/d11`)
        expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/d2/d11/fileA.txt`)

        for (const node of nodes) {
          // 移動元'd1'のユーザーIDは除去され、移動先'd2'はユーザーIDの設定がないので、
          // 結果としてユーザーIDが未設定であることを検証
          expect(node.share).toEqual(EMPTY_SHARE_SETTINGS)
        }
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual))
    })

    it('共有設定 - 移動元ディレクトリにユーザーIDの共有設定があり、かつ移動先ディレクトリに別のユーザーIDの共有設定がある場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems)

      // 移動元'd1'にユーザーIDを設定をしておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })
      // 移動先'd2'にユーザーIDを設定をしておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d2`, { uids: ['jiro'] })

      // 'd1/d11'を'd2/d11'へ移動
      const actual = await storageService.moveDir(`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2/d11`)

      const verify = (nodes: StorageNode[]) => {
        expect(nodes.length).toBe(2)
        expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/d2/d11`)
        expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/d2/d11/fileA.txt`)

        for (const node of nodes) {
          // 移動元'd1'のユーザーIDは除去され、移動先'd2'のユーザーIDが適用されていることを検証
          expect(node.share).toEqual({ isPublic: false, uids: ['jiro'] } as StorageNodeShareSettings)
        }
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual))
    })

    it('共有設定 - 移動元ディレクトリにユーザーIDの共有設定があり、かつ配下ノードに別のユーザーIDが設定されていて、かつ移動先ディレクトリに別のユーザーIDの共有設定がある場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems)

      // 移動元'd1'にユーザーIDを設定しておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })
      // 移動元配下ノードにユーザーIDの共有設定をしておく
      await storageService.setFileShareSettings(`${TEST_FILES_DIR}/d1/d11/fileA.txt`, { uids: ['saburo'] })
      // 移動先'd2'ユーザーIDを設定しておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d2`, { uids: ['jiro'] })

      // 'd1/d11'を'd2/d11'へ移動
      const actual = await storageService.moveDir(`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2/d11`)

      const verify = (nodes: StorageNode[]) => {
        expect(nodes.length).toBe(2)
        expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/d2/d11`)
        expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/d2/d11/fileA.txt`)

        expect(nodes[0].share).toEqual({ isPublic: false, uids: ['jiro'] } as StorageNodeShareSettings)
        // 移動元'd1'のユーザーIDは除去され、移動先'd2'のユーザーIDと'fileA.txt'のユーザーID
        // がマージされていることを検証
        expect(nodes[1].share).toEqual({ isPublic: false, uids: ['saburo', 'jiro'] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual))
    })

    it('共有設定 - basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`d1/d11`, `d2`], `${TEST_FILES_DIR}`)

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems, `${TEST_FILES_DIR}`)

      // 移動元'd1'にユーザーIDの共有設定をしておく
      await storageService.setDirShareSettings(`d1`, { uids: ['ichiro'] }, `${TEST_FILES_DIR}`)
      // 移動先'd2'にユーザーIDの共有設定をしておく
      await storageService.setDirShareSettings(`d2`, { uids: ['jiro'] }, `${TEST_FILES_DIR}`)

      // 'd1/d11'を'd2/d11'へ移動
      const actual = await storageService.moveDir(`d1/d11`, `d2/d11`, `${TEST_FILES_DIR}`)

      const verify = (nodes: StorageNode[]) => {
        expect(nodes.length).toBe(2)
        expect(nodes[0].path).toBe(`d2/d11`)
        expect(nodes[1].path).toBe(`d2/d11/fileA.txt`)

        for (const node of nodes) {
          // 移動元'd1'のユーザーIDは除去され、移動先'd2'のユーザーIDが適用されていることを検証
          expect(node.share).toEqual({ isPublic: false, uids: ['jiro'] } as StorageNodeShareSettings)
        }
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual, `${TEST_FILES_DIR}`))
    })
  })

  describe('moveUserDir', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)

      // ディレクトリを作成
      await storageService.createDirs([`d1/d11`, `d2`], `${userDirPath}`)

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList, `${userDirPath}`)

      const fromDirNode = await storageService.getDirNode(`d1`, `${userDirPath}`)
      const actual = await storageService.moveUserDir(STORAGE_TEST_USER, fromDirNode.path, `d2/d1`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d2/d1`)
      expect(actual[1].path).toBe(`d2/d1/d11`)
      expect(actual[2].path).toBe(`d2/d1/d11/fileA.txt`)
      await existsNodes(actual, `${userDirPath}`)
      await notExistsNodes([fromDirNode], `${userDirPath}`)
    })
  })

  describe('moveFile', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const fromFileNode = await storageService.getFileNode(`${TEST_FILES_DIR}/d1/fileA.txt`)
      const actual = await storageService.moveFile(fromFileNode.path, `${TEST_FILES_DIR}/d2/fileA.txt`)

      expect(actual!.path).toBe(`${TEST_FILES_DIR}/d2/fileA.txt`)
      await existsNodes([actual!])
      await notExistsNodes([fromFileNode])
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`d1`, `d2`], `${TEST_FILES_DIR}`)

      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const fromFileNode = await storageService.getFileNode(`d1/fileA.txt`, `${TEST_FILES_DIR}`)
      const actual = await storageService.moveFile(fromFileNode.path, `d2/fileA.txt`, `${TEST_FILES_DIR}`)

      expect(actual!.path).toBe(`d2/fileA.txt`)
      await existsNodes([actual!], `${TEST_FILES_DIR}`)
      await notExistsNodes([fromFileNode], `${TEST_FILES_DIR}`)
    })

    it(`fromFilePath、toFilePath、basePathの先頭・末尾に'/'を付与した場合`, async () => {
      // ディレクトリを作成
      await storageService.createDirs([`d1`, `d2`], `${TEST_FILES_DIR}`)

      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // パスの先頭・末尾に'/'を付与
      const fromFileNode = await storageService.getFileNode(`/d1/fileA.txt/`, `/${TEST_FILES_DIR}/`)
      const actual = await storageService.moveFile(fromFileNode.path, `/d2/fileA.txt/`, `/${TEST_FILES_DIR}/`)

      expect(actual!.path).toBe(`d2/fileA.txt`)
      await existsNodes([actual!], `${TEST_FILES_DIR}`)
      await notExistsNodes([fromFileNode], `${TEST_FILES_DIR}`)
    })

    it('移動先に同名のファイルが存在する場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // 作成したディレクトリにファイルをアップロード
      // 'd1'と'd2'配下に'file.txt'を配置
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/file.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d2/file.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems)

      const fromFileNode = await storageService.getFileNode(`${TEST_FILES_DIR}/d1/file.txt`)
      const actual = await storageService.moveFile(fromFileNode.path, `${TEST_FILES_DIR}/d2/file.txt`)

      expect(actual!.path).toBe(`${TEST_FILES_DIR}/d2/file.txt`)
      await existsNodes([actual!])
      await notExistsNodes([fromFileNode])

      const toFileNode = await storageService.getFileNode(`${TEST_FILES_DIR}/d2/file.txt`)
      const toFileData = await toFileNode.gcsNode.download()
      expect(toFileData.toString()).toBe('testA')
    })

    it('移動元ファイルがない場合', async () => {
      let actual: Error
      try {
        const fromFileNode = await storageService.getFileNode(`${TEST_FILES_DIR}/d1/fileA.txt`)
        await storageService.moveFile(fromFileNode.path, `${TEST_FILES_DIR}/d2/fileA.txt`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The source file does not exist: '${TEST_FILES_DIR}/d1/fileA.txt'`)
    })

    it('移動先ディレクトリがない場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      let actual: Error
      try {
        const fromFileNode = await storageService.getFileNode(`${TEST_FILES_DIR}/d1/fileA.txt`)
        await storageService.moveFile(fromFileNode.path, `${TEST_FILES_DIR}/d2/fileA.txt`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The destination directory does not exist: '${TEST_FILES_DIR}/d2'`)
    })

    it('移動先ファイルパスへのバリデーション実行確認', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // バリデーションメソッドのモック化
      const validatePath = td.replace(storageService, 'validatePath')

      await storageService.moveFile(`${TEST_FILES_DIR}/d1/fileA.txt`, `${TEST_FILES_DIR}/d2/fileA.txt`)

      const explanation = td.explain(validatePath)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(`${TEST_FILES_DIR}/d2/fileA.txt`)
    })

    it('共有設定 - 移動元ディレクトリの共有設定はなく、かつ移動先ディレクトリは公開フラグがオンの場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems)

      // 移動先'd2'に公開フラグを設定しておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d2`, { isPublic: true })

      // 'd1/fileA.txt'を'd2/fileA.txt'へ移動
      const actual = await storageService.moveFile(`${TEST_FILES_DIR}/d1/fileA.txt`, `${TEST_FILES_DIR}/d2/fileA.txt`)

      const verify = (fileNode: StorageNode) => {
        expect(fileNode.path).toBe(`${TEST_FILES_DIR}/d2/fileA.txt`)
        // 移動先'd2'の公開フラグが適用されていることを検証
        expect(fileNode.share).toEqual({ isPublic: true, uids: [] })
      }
      verify(actual)
      verify(await storageService.getFileNode(actual.path))
    })

    it('共有設定 - 移動元ディレクトリの公開フラグがオンで、かつ移動先ディレクトリの公開フラグもオンの場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems)

      // 移動元'd1'に共有設定しておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { isPublic: true })
      // 移動元'd2'に共有設定しておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d2`, { isPublic: true })

      // 'd1/fileA.txt'を'd2/fileA.txt'へ移動
      const actual = await storageService.moveFile(`${TEST_FILES_DIR}/d1/fileA.txt`, `${TEST_FILES_DIR}/d2/fileA.txt`)

      const verify = (fileNode: StorageNode) => {
        expect(fileNode.path).toBe(`${TEST_FILES_DIR}/d2/fileA.txt`)
        // 移動先'd2'の公開フラグが適用されていることを検証
        expect(fileNode.share).toEqual({ isPublic: true, uids: [] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await storageService.getFileNode(actual.path))
    })

    it('共有設定 - 移動元ディレクトリの公開フラグがオンで、かつ移動先ディレクトリの公開フラグがオフの場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems)

      // 移動元'd1'に公開フラグを設定しておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { isPublic: true })
      // 移動元'd2'に公開フラグを設定しておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d2`, { isPublic: false })

      // 'd1/fileA.txt'を'd2/fileA.txt'へ移動
      const actual = await storageService.moveFile(`${TEST_FILES_DIR}/d1/fileA.txt`, `${TEST_FILES_DIR}/d2/fileA.txt`)

      const verify = (fileNode: StorageNode) => {
        expect(fileNode.path).toBe(`${TEST_FILES_DIR}/d2/fileA.txt`)
        // 移動先'd2'の公開フラグが適用されていることを検証
        expect(fileNode.share).toEqual(EMPTY_SHARE_SETTINGS)
      }
      verify(actual)
      verify(await storageService.getFileNode(actual.path))
    })

    it('共有設定 - 移動元ディレクトリの公開フラグがオフで、かつ移動先ディレクトリの公開フラグがオンの場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems)

      // 移動元'd1'に公開フラグを設定しておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { isPublic: false })
      // 移動元'd2'に公開フラグを設定しておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d2`, { isPublic: true })

      // 'd1/fileA.txt'を'd2/fileA.txt'へ移動
      const actual = await storageService.moveFile(`${TEST_FILES_DIR}/d1/fileA.txt`, `${TEST_FILES_DIR}/d2/fileA.txt`)

      const verify = (fileNode: StorageNode) => {
        expect(fileNode.path).toBe(`${TEST_FILES_DIR}/d2/fileA.txt`)
        // 移動先'd2'の公開フラグが適用されていることを検証
        expect(fileNode.share).toEqual({ isPublic: true, uids: [] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await storageService.getFileNode(actual.path))
    })

    it('共有設定 - 移動元ディレクトリの公開フラグがオフで、かつ配下に公開フラグがオンのノードがあり、かつ移動先ディレクトリの公開フラグがオフの場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems)

      // 移動元'd1'に公開フラグを設定しておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { isPublic: false })
      // 移動ファイルに公開フラグを設定しておく
      await storageService.setFileShareSettings(`${TEST_FILES_DIR}/d1/fileA.txt`, { isPublic: true })
      // 移動先'd2'に公開フラグを設定しておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d2`, { isPublic: false })

      // 'd1/fileA.txt'を'd2/fileA.txt'へ移動
      const actual = await storageService.moveFile(`${TEST_FILES_DIR}/d1/fileA.txt`, `${TEST_FILES_DIR}/d2/fileA.txt`)

      const verify = (fileNode: StorageNode) => {
        expect(fileNode.path).toBe(`${TEST_FILES_DIR}/d2/fileA.txt`)
        // 'fileA.txt'に独自設定された公開フラグが維持されていることを検証
        expect(fileNode.share).toEqual({ isPublic: true, uids: [] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await storageService.getFileNode(actual.path))
    })

    it('共有設定 - 移動元ディレクトリに共有設定がなく、かつ移動先ディレクトリにユーザーIDの共有設定がある場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems)

      // 移動先'd2'にユーザーIDを設定しておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d2`, { uids: ['jiro'] })

      // 'd1/fileA.txt'を'd2/fileA.txt'へ移動
      const actual = await storageService.moveFile(`${TEST_FILES_DIR}/d1/fileA.txt`, `${TEST_FILES_DIR}/d2/fileA.txt`)

      const verify = (fileNode: StorageNode) => {
        expect(fileNode.path).toBe(`${TEST_FILES_DIR}/d2/fileA.txt`)
        // 移動先'd2'のユーザーIDが適用されていることを検証
        expect(fileNode.share).toEqual({ isPublic: false, uids: ['jiro'] })
      }
      verify(actual)
      verify(await storageService.getFileNode(actual.path))
    })

    it('共有設定 - 移動元ディレクトリにユーザーIDの共有設定があり、かつ移動先ディレクトリにユーザーIDの共有設定がない場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems)

      // 移動元'd1'に共有設定しておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })

      // 'd1/fileA.txt'を'd2/fileA.txt'へ移動
      const actual = await storageService.moveFile(`${TEST_FILES_DIR}/d1/fileA.txt`, `${TEST_FILES_DIR}/d2/fileA.txt`)

      const verify = (fileNode: StorageNode) => {
        expect(fileNode.path).toBe(`${TEST_FILES_DIR}/d2/fileA.txt`)
        // 移動元'd1'のユーザーIDは除去され、移動先'd2'はユーザーIDの設定がないので、
        // 結果としてユーザーIDが未設定であることを検証
        expect(fileNode.share).toEqual(EMPTY_SHARE_SETTINGS)
      }
      verify(actual)
      verify(await storageService.getFileNode(actual.path))
    })

    it('共有設定 - 移動元ディレクトリにユーザーIDの共有設定があり、かつ移動先ディレクトリに別のユーザーIDの共有設定がある場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems)

      // 移動元'd1'にユーザーIDを設定しておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })
      // 移動先'd2'にユーザーIDを設定しておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d2`, { uids: ['jiro'] })

      // 'd1/fileA.txt'を'd2/fileA.txt'へ移動
      const actual = await storageService.moveFile(`${TEST_FILES_DIR}/d1/fileA.txt`, `${TEST_FILES_DIR}/d2/fileA.txt`)

      const verify = (fileNode: StorageNode) => {
        expect(fileNode.path).toBe(`${TEST_FILES_DIR}/d2/fileA.txt`)
        // 移動元'd1'のユーザーIDは除去され、移動先'd2'のユーザーIDが適用されていることを検証
        expect(fileNode.share).toEqual({ isPublic: false, uids: ['jiro'] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await storageService.getFileNode(actual.path))
    })

    it('共有設定 - 移動元ディレクトリにユーザーIDの共有設定があり、かつファイルに別のユーザーIDが設定されていて、かつ移動先ディレクトリに別のユーザーIDの共有設定がある場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems)

      // 移動元'd1'にユーザーIDを設定しておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })
      // 移動ファイルにユーザーIDを設定しておく
      await storageService.setFileShareSettings(`${TEST_FILES_DIR}/d1/fileA.txt`, { uids: ['saburo'] })
      // 移動先'd2'にユーザーIDを設定しておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d2`, { uids: ['jiro'] })

      // 'd1/fileA.txt'を'd2/fileA.txt'へ移動
      const actual = await storageService.moveFile(`${TEST_FILES_DIR}/d1/fileA.txt`, `${TEST_FILES_DIR}/d2/fileA.txt`)

      const verify = (fileNode: StorageNode) => {
        expect(fileNode.path).toBe(`${TEST_FILES_DIR}/d2/fileA.txt`)
        // 移動元'd1'のユーザーIDは除去され、移動先'd2'のユーザーIDと'fileA.txt'のユーザーID
        // がマージされていることを検証
        expect(fileNode.share).toEqual({ isPublic: false, uids: ['saburo', 'jiro'] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await storageService.getFileNode(actual.path))
    })

    it('共有設定 - basePathを指定', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`d1`, `d2`], `${TEST_FILES_DIR}`)

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems, `${TEST_FILES_DIR}`)

      // 移動元'd1'にユーザーIDを設定しておく
      await storageService.setDirShareSettings(`d1`, { uids: ['ichiro'] }, `${TEST_FILES_DIR}`)
      // 移動先'd2'にユーザーIDを設定しておく
      await storageService.setDirShareSettings(`d2`, { uids: ['jiro'] }, `${TEST_FILES_DIR}`)

      // 'd1/fileA.txt'を'd2/fileA.txt'へ移動
      const actual = await storageService.moveFile(`d1/fileA.txt`, `d2/fileA.txt`, `${TEST_FILES_DIR}`)

      const verify = (fileNode: StorageNode) => {
        expect(fileNode.path).toBe(`d2/fileA.txt`)
        // 移動元'd1'のユーザーIDは除去され、移動先'd2'のユーザーIDが適用されていることを検証
        expect(fileNode.share).toEqual({ isPublic: false, uids: ['jiro'] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await storageService.getFileNode(actual.path, `${TEST_FILES_DIR}`))
    })
  })

  describe('moveUserFile', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)

      // ディレクトリを作成
      await storageService.createDirs([`d1`, `d2`], `${userDirPath}`)

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `d1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList, `${userDirPath}`)

      const fromFileNode = await storageService.getFileNode(`d1/fileA.txt`, userDirPath)
      const actual = await storageService.moveUserFile(STORAGE_TEST_USER, `d1/fileA.txt`, `d2/fileA.txt`)

      await existsNodes([actual!], `${userDirPath}`)
      await notExistsNodes([fromFileNode], `${userDirPath}`)
    })
  })

  describe('renameDir', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1/d11`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const dirNode = await storageService.getDirNode(`${TEST_FILES_DIR}/d1`)
      const actual = await storageService.renameDir(dirNode.path, `d2`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d2`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d2/d11`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d2/d11/fileA.txt`)
      await existsNodes(actual)
      await notExistsNodes([dirNode])
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1/d11`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const dirNode = await storageService.getDirNode(`d1`, `${TEST_FILES_DIR}`)
      const actual = await storageService.renameDir(dirNode.path, `d2`, `${TEST_FILES_DIR}`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d2`)
      expect(actual[1].path).toBe(`d2/d11`)
      expect(actual[2].path).toBe(`d2/d11/fileA.txt`)
      await existsNodes(actual, `${TEST_FILES_DIR}`)
      await notExistsNodes([dirNode], `${TEST_FILES_DIR}`)
    })

    it(`basePathを指定した場合 - パスの先頭・末尾に'/'を付与`, async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1/d11`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // パスの先頭・末尾に'/'を付与
      const dirNode = await storageService.getDirNode(`/d1/`, `/${TEST_FILES_DIR}/`)
      const actual = await storageService.renameDir(dirNode.path, `d2`, `/${TEST_FILES_DIR}/`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d2`)
      expect(actual[1].path).toBe(`d2/d11`)
      expect(actual[2].path).toBe(`d2/d11/fileA.txt`)
      await existsNodes(actual, `${TEST_FILES_DIR}`)
      await notExistsNodes([dirNode], `${TEST_FILES_DIR}`)
    })

    it('リネームしようとする名前のディレクトリが既に存在する場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1/docs`, `${TEST_FILES_DIR}/d1/files`])

      let actual: Error
      try {
        // 'd1/docs'を'd1/files'へリネーム
        const dirNode = await storageService.getDirNode(`${TEST_FILES_DIR}/d1/docs`)
        await storageService.renameDir(dirNode.path, `files`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The specified directory name already exists: '${TEST_FILES_DIR}/d1/docs' -> '${TEST_FILES_DIR}/d1/files'`)
    })

    it('ディレクトリパスにディレクトリ名と同じディレクトリがあった場合', async () => {
      // ディレクトリを作成
      // あえて'd1/d1'というディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          // 'd1/d1'というディレクトリにファイルを配置
          toFilePath: `${TEST_FILES_DIR}/d1/d1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // 'd1/d1'を'd1/d2'へリネーム
      const dirNode = await storageService.getDirNode(`${TEST_FILES_DIR}/d1/d1`)
      const actual = await storageService.renameDir(dirNode.path, `d2`)

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1/d2`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1/d2/fileA.txt`)
      await existsNodes(actual)
      await notExistsNodes([dirNode])
    })

    it('既存のディレクトリ名に文字を付け加える形でリネームをした場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      // 'd1'を'd1XXX'へリネーム
      const dirNode = await storageService.getDirNode(`${TEST_FILES_DIR}/d1`)
      const actual = await storageService.renameDir(dirNode.path, `d1XXX`)

      expect(actual.length).toBe(1)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1XXX`)
      await existsNodes(actual)
      await notExistsNodes([dirNode])
    })

    it('リネームディレクトリパスへのバリデーション実行確認', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      // バリデーションメソッドのモック化
      const validateDirName = td.replace(storageService, 'validateDirName')

      await storageService.renameDir(`${TEST_FILES_DIR}/d1`, `d2`)

      const explanation = td.explain(validateDirName)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(`d2`)
    })
  })

  describe('renameUserDir', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)

      // ディレクトリを作成
      await storageService.createDirs([`d1/d11`], `${userDirPath}`)

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList, `${userDirPath}`)

      const dirNode = await storageService.getDirNode(`d1`, `${userDirPath}`)
      const actual = await storageService.renameDir(dirNode.path, `d2`, `${userDirPath}`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d2`)
      expect(actual[1].path).toBe(`d2/d11`)
      expect(actual[2].path).toBe(`d2/d11/fileA.txt`)
      await existsNodes(actual, `${userDirPath}`)
      await notExistsNodes([dirNode], `${userDirPath}`)
    })
  })

  describe('renameFile', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const fromFileNode = await storageService.getFileNode(`${TEST_FILES_DIR}/d1/fileA.txt`)
      const actual = await storageService.renameFile(fromFileNode.path, 'fileB.txt')

      expect(actual!.path).toBe(`${TEST_FILES_DIR}/d1/fileB.txt`)
      await existsNodes([actual!])
      await notExistsNodes([fromFileNode])
    })

    it('basePathを指定', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const fileNode = await storageService.getFileNode(`d1/fileA.txt`, `${TEST_FILES_DIR}`)
      const actual = await storageService.renameFile(fileNode.path, 'fileB.txt', `${TEST_FILES_DIR}`)

      expect(actual!.path).toBe(`d1/fileB.txt`)
      await existsNodes([actual!], `${TEST_FILES_DIR}`)
      await notExistsNodes([fileNode], `${TEST_FILES_DIR}`)
    })

    it(`basePathを指定 - パスの先頭・末尾に'/'を付与`, async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // パスの先頭・末尾に'/'を付与
      const fileNode = await storageService.getFileNode(`/d1/fileA.txt/`, `/${TEST_FILES_DIR}/`)
      const actual = await storageService.renameFile(fileNode.path, 'fileB.txt', `/${TEST_FILES_DIR}/`)

      expect(actual!.path).toBe(`d1/fileB.txt`)
      await existsNodes([actual!], `${TEST_FILES_DIR}`)
      await notExistsNodes([fileNode], `${TEST_FILES_DIR}`)
    })

    it('リネームしようとする名前のファイルが既に存在する場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      let actual: Error
      try {
        // 'd1/fileA.txt'を'd1/fileB.txt'へリネーム
        const fileNode = await storageService.getDirNode(`${TEST_FILES_DIR}/d1/fileA.txt`)
        await storageService.renameFile(fileNode.path, `fileB.txt`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The specified file name already exists: '${TEST_FILES_DIR}/d1/fileA.txt' -> '${TEST_FILES_DIR}/d1/fileB.txt'`)
    })

    it('ファイルパスにファイル名と同じディレクトリがあった場合', async () => {
      // ディレクトリを作成
      // あえて'd1/fileA.txt'というディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1/fileA.txt`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          // 'd1/fileA.txt'というディレクトリに'fileA.txt'というファイルを配置
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const fileNode = await storageService.getFileNode(`${TEST_FILES_DIR}/d1/fileA.txt/fileA.txt`)
      const actual = await storageService.renameFile(fileNode.path, 'fileB.txt')

      // 'fileA.txt'というディレクトリ名は変わらず、
      // 'fileA.txt'が'fileB.txt'に名前変更されたことを確認
      expect(actual!.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt/fileB.txt`)
      await existsNodes([actual!])
      await notExistsNodes([fileNode])
    })

    it('リネームディレクトリパスへのバリデーション実行確認', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // バリデーションメソッドのモック化
      const validateFileName = td.replace(storageService, 'validateFileName')

      await storageService.renameFile(`${TEST_FILES_DIR}/d1/fileA.txt`, `fileB.txt`)

      const explanation = td.explain(validateFileName)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(`fileB.txt`)
    })
  })

  describe('renameUserFile', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)

      // ディレクトリを作成
      await storageService.createDirs([`d1`], `${userDirPath}`)

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `d1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList, `${userDirPath}`)

      const fromFileNode = await storageService.getFileNode(`d1/fileA.txt`, `${userDirPath}`)
      const actual = await storageService.renameUserFile(STORAGE_TEST_USER, fromFileNode.path, 'fileB.txt')

      expect(actual!.path).toBe(`d1/fileB.txt`)
      await existsNodes([actual!], `${userDirPath}`)
      await notExistsNodes([fromFileNode], `${userDirPath}`)
    })
  })

  describe('setDirShareSettings', () => {
    beforeEach(async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1/d11`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileB.txt`,
        },
        {
          data: 'testC',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d2/d21/fileC.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems)
    })

    it('共有設定 - 共有未設定の状態から公開フラグをオンに設定', async () => {
      const actual = await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { isPublic: true })

      const verify = (nodes: StorageNode[]) => {
        expect(actual.length).toBe(4)
        expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1`)
        expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
        expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
        expect(actual[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileB.txt`)

        for (const node of actual) {
          expect(node.share).toEqual({ isPublic: true, uids: [] } as StorageNodeShareSettings)
        }
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual))
    })

    it('共有設定 - 公開フラグをオンの状態からオフに設定', async () => {
      // 自身のディレクトリの公開フラグをオンにしておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { isPublic: true })

      // 自身のディレクトリの共有解除
      const actual = await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { isPublic: false })

      const verify = (nodes: StorageNode[]) => {
        expect(nodes.length).toBe(4)
        expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/d1`)
        expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
        expect(nodes[2].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
        expect(nodes[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileB.txt`)

        for (const node of nodes) {
          expect(node.share).toEqual(EMPTY_SHARE_SETTINGS)
        }
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual))
    })

    it('共有設定 - 公開フラグのみを変更した場合、他の項目に影響がないことを検証', async () => {
      // 自身のディレクトリにユーザーIDの共有設定をしておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })

      // 自身のディレクトリの公開フラグのみ変更
      const actual = await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { isPublic: true })

      const verify = (nodes: StorageNode[]) => {
        expect(actual.length).toBe(4)
        expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1`)
        expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
        expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
        expect(actual[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileB.txt`)

        // 公開フラグのみが変更され、他の項目に影響がないことを検証
        for (const node of actual) {
          expect(node.share).toEqual({ isPublic: true, uids: ['ichiro'] } as StorageNodeShareSettings)
        }
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual))
    })

    it('共有設定 - 自身のディレクトリの公開フラグがオンの状態でかつ配下に公開フラグがオフのノードがある場合、この状態で自身のディレクトリに再度公開フラグをオンにした場合', async () => {
      // 自身のディレクトリの公開フラグをオンにしておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { isPublic: true })
      // 配下ノードにの公開フラグをオフにしておく
      await storageService.setFileShareSettings(`${TEST_FILES_DIR}/d1/d11/fileB.txt`, { isPublic: false })

      const actual = await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { isPublic: true })

      const verify = (nodes: StorageNode[]) => {
        expect(actual.length).toBe(4)
        expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1`)
        expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
        expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
        expect(actual[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileB.txt`)

        expect(nodes[0].share).toEqual({ isPublic: true, uids: [] } as StorageNodeShareSettings)
        expect(nodes[1].share).toEqual({ isPublic: true, uids: [] } as StorageNodeShareSettings)
        expect(nodes[2].share).toEqual({ isPublic: true, uids: [] } as StorageNodeShareSettings)
        // 独自に設定された公開フラグは維持されていることを検証
        expect(nodes[3].share).toEqual(EMPTY_SHARE_SETTINGS)
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual))
    })

    it('共有設定 - ユーザーIDの共有が未設定の状態からユーザーIDを設定', async () => {
      const settings: StorageNodeShareSettingsInput = { uids: ['ichiro'] }
      const actual = await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, settings)

      const verify = (nodes: StorageNode[]) => {
        expect(actual.length).toBe(4)
        expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1`)
        expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
        expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
        expect(actual[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileB.txt`)

        for (const node of actual) {
          expect(node.share).toEqual({ isPublic: false, uids: settings.uids } as StorageNodeShareSettings)
        }
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual))
    })

    it('共有設定 - ユーザーIDを除去', async () => {
      // 自身のディレクトリに共有設定しておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })

      // 自身のディレクトリに空のユーザーIDを設定
      const actual = await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { uids: [] })

      const verify = (nodes: StorageNode[]) => {
        expect(nodes.length).toBe(4)
        expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/d1`)
        expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
        expect(nodes[2].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
        expect(nodes[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileB.txt`)

        for (const node of nodes) {
          expect(node.share).toEqual(EMPTY_SHARE_SETTINGS)
        }
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual))
    })

    it('共有設定 - ユーザーIDのみを変更した場合、他の項目に影響がないことを検証', async () => {
      // 自身のディレクトリに公開フラグを設定しておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { isPublic: true })

      // 自身のディレクトリのユーザーIDのみ変更
      const actual = await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })

      const verify = (nodes: StorageNode[]) => {
        expect(actual.length).toBe(4)
        expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1`)
        expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
        expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
        expect(actual[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileB.txt`)

        // ユーザーIDのみが変更され、他の項目に影響がないことを検証
        for (const node of actual) {
          expect(node.share).toEqual({ isPublic: true, uids: ['ichiro'] } as StorageNodeShareSettings)
        }
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual))
    })

    it('共有設定 - 自身のディレクトリにユーザーIDの共有設定がされている状態で、自身のディレクトリに別のユーザーIDを設定した場合', async () => {
      // 自身のディレクトリにユーザーIDの共有設定をしておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { uids: ['jiro'] })

      // ディレクトリにユーザーIDの共有設定を行う
      const actual = await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })

      const verify = (nodes: StorageNode[]) => {
        expect(nodes.length).toBe(4)
        expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/d1`)
        expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
        expect(nodes[2].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
        expect(nodes[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileB.txt`)

        // 今回の設定が以前の設定を上書きしていることを検証
        expect(nodes[0].share).toEqual({ isPublic: false, uids: ['ichiro'] } as StorageNodeShareSettings)
        expect(nodes[1].share).toEqual({ isPublic: false, uids: ['ichiro'] } as StorageNodeShareSettings)
        expect(nodes[2].share).toEqual({ isPublic: false, uids: ['ichiro'] } as StorageNodeShareSettings)
        expect(nodes[3].share).toEqual({ isPublic: false, uids: ['ichiro'] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual))
    })

    it('共有設定 - 自身のディレクトリにユーザーIDの共有設定がされていてかつ配下ノードに別のユーザーIDが共有設定されている状態で、自身のディレクトリに別のユーザーIDを設定した場合', async () => {
      // 自身のディレクトリにユーザーIDの共有設定をしておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })
      // 配下ノードにユーザーIDの共有設定をしておく
      await storageService.setFileShareSettings(`${TEST_FILES_DIR}/d1/d11/fileB.txt`, { uids: ['jiro'] })

      // ディレクトリにユーザーIDの共有設定を行う
      const actual = await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { uids: ['saburo'] })

      const verify = (nodes: StorageNode[]) => {
        expect(nodes.length).toBe(4)
        expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/d1`)
        expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
        expect(nodes[2].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
        expect(nodes[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileB.txt`)

        expect(nodes[0].share).toEqual({ isPublic: false, uids: ['saburo'] } as StorageNodeShareSettings)
        expect(nodes[1].share).toEqual({ isPublic: false, uids: ['saburo'] } as StorageNodeShareSettings)
        expect(nodes[2].share).toEqual({ isPublic: false, uids: ['saburo'] } as StorageNodeShareSettings)
        // 'ichiro'は除去され、独自設定の'jiro'と今回設定された'saburo'が設定されていることを検証
        expect(actual[3].share).toEqual({ isPublic: false, uids: ['jiro', 'saburo'] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual))
    })

    it('共有設定 - 配下ノードにユーザーIDの共有設定がされている状態で、祖先のディレクトリに別のユーザーIDを設定した場合', async () => {
      // 配下ノードにユーザーIDの共有設定をしておく
      await storageService.setFileShareSettings(`${TEST_FILES_DIR}/d1/d11/fileB.txt`, { uids: ['jiro'] })

      // ディレクトリにユーザーIDの共有設定を行う
      const actual = await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })

      const verify = (nodes: StorageNode[]) => {
        expect(nodes.length).toBe(4)
        expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/d1`)
        expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
        expect(nodes[2].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
        expect(nodes[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileB.txt`)

        expect(nodes[0].share).toEqual({ isPublic: false, uids: ['ichiro'] } as StorageNodeShareSettings)
        expect(nodes[1].share).toEqual({ isPublic: false, uids: ['ichiro'] } as StorageNodeShareSettings)
        expect(nodes[2].share).toEqual({ isPublic: false, uids: ['ichiro'] } as StorageNodeShareSettings)
        // 既存のユーザーIDと新規のユーザーIDがマージされていることを検証
        expect(nodes[3].share).toEqual({ isPublic: false, uids: ['jiro', 'ichiro'] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual))
    })

    it('共有設定 - 配下ノードにユーザーIDの共有設定がされている状態で、祖先のディレクトリに同じユーザーIDを設定した場合', async () => {
      // 配下ノードにユーザーIDの共有設定をしておく
      await storageService.setFileShareSettings(`${TEST_FILES_DIR}/d1/d11/fileB.txt`, { uids: ['ichiro'] })

      // ディレクトリにユーザーIDの共有設定を行う
      const actual = await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })

      const verify = (nodes: StorageNode[]) => {
        expect(nodes.length).toBe(4)
        expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/d1`)
        expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
        expect(nodes[2].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
        expect(nodes[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileB.txt`)

        expect(nodes[0].share).toEqual({ isPublic: false, uids: ['ichiro'] } as StorageNodeShareSettings)
        expect(nodes[1].share).toEqual({ isPublic: false, uids: ['ichiro'] } as StorageNodeShareSettings)
        expect(nodes[2].share).toEqual({ isPublic: false, uids: ['ichiro'] } as StorageNodeShareSettings)
        // 既存のユーザーIDと今回設定しようとしたユーザーIDが重複登録されていないことを検証
        expect(nodes[3].share).toEqual({ isPublic: false, uids: ['ichiro'] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual))
    })

    it('共有設定 - ファイルは存在するが親(または祖孫)ディレクトリが存在しないディレクトリパスを指定した場合', async () => {
      // 'd2'はCloud Storageに存在しない(ただし配下に'fileC.txt'が存在する)
      const actual = await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d2`, { isPublic: true })

      const verify = (nodes: StorageNode[]) => {
        expect(nodes.length).toBe(3)
        expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/d2`)
        expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/d2/d21`)
        expect(nodes[2].path).toBe(`${TEST_FILES_DIR}/d2/d21/fileC.txt`)

        for (const node of nodes) {
          expect(node.share).toEqual({ isPublic: true, uids: [] } as StorageNodeShareSettings)
        }
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual))
    })

    it('nullを指定 - 共有設定なしから', async () => {
      const actual = await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, null)

      const verify = (nodes: StorageNode[]) => {
        expect(nodes.length).toBe(4)
        expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/d1`)
        expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
        expect(nodes[2].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
        expect(nodes[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileB.txt`)

        for (const node of nodes) {
          expect(node.share).toEqual(EMPTY_SHARE_SETTINGS)
        }
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual))
    })

    it('nullを指定 - 共有設定ありから', async () => {
      // 公開フラグ、ユーザーIDを設定しておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { isPublic: true, uids: ['ichiro'] })

      const actual = await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, null)

      const verify = (nodes: StorageNode[]) => {
        expect(nodes.length).toBe(4)
        expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/d1`)
        expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
        expect(nodes[2].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
        expect(nodes[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileB.txt`)

        for (const node of nodes) {
          expect(node.share).toEqual(EMPTY_SHARE_SETTINGS)
        }
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual))
    })

    it('nullを指定 - 配下ノードの公開フラグとユーザーID設定ありから', async () => {
      // 配下ノードに公開フラグ、ユーザーIDを設定しておく
      await storageService.setFileShareSettings(`${TEST_FILES_DIR}/d1/d11/fileB.txt`, { isPublic: true, uids: ['ichiro'] })

      const actual = await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, null)

      const verify = (nodes: StorageNode[]) => {
        expect(nodes.length).toBe(4)
        expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/d1`)
        expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
        expect(nodes[2].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
        expect(nodes[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileB.txt`)

        expect(nodes[0].share).toEqual(EMPTY_SHARE_SETTINGS)
        expect(nodes[1].share).toEqual(EMPTY_SHARE_SETTINGS)
        expect(nodes[2].share).toEqual(EMPTY_SHARE_SETTINGS)
        // 独自に設定された項目は維持されていることを検証
        expect(nodes[3].share).toEqual({ isPublic: true, uids: ['ichiro'] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual))
    })

    it('basePathを指定した場合', async () => {
      const settings: StorageNodeShareSettings = { isPublic: true, uids: ['ichiro'] }
      const actual = await storageService.setDirShareSettings(`d1`, settings, `${TEST_FILES_DIR}`)

      const verify = (nodes: StorageNode[]) => {
        expect(nodes.length).toBe(4)
        expect(nodes[0].path).toBe(`d1`)
        expect(nodes[1].path).toBe(`d1/d11`)
        expect(nodes[2].path).toBe(`d1/d11/fileA.txt`)
        expect(nodes[3].path).toBe(`d1/d11/fileB.txt`)

        for (const node of nodes) {
          expect(node.share).toEqual(settings)
        }
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual, `${TEST_FILES_DIR}`))
    })

    it(`dirPath、basePathの先頭・末尾に'/'を付与`, async () => {
      const settings: StorageNodeShareSettings = { isPublic: true, uids: ['ichiro'] }
      const actual = await storageService.setDirShareSettings(`/d1/`, settings, `/${TEST_FILES_DIR}/`)

      const verify = (nodes: StorageNode[]) => {
        expect(nodes.length).toBe(4)
        expect(nodes[0].path).toBe(`d1`)
        expect(nodes[1].path).toBe(`d1/d11`)
        expect(nodes[2].path).toBe(`d1/d11/fileA.txt`)
        expect(nodes[3].path).toBe(`d1/d11/fileB.txt`)

        for (const node of nodes) {
          expect(node.share).toEqual(settings)
        }
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual, `${TEST_FILES_DIR}`))
    })

    it('存在しないディレクトリを指定した場合', async () => {
      // 'd2'はCloud Storageに存在しない(ただし配下に'fileC.txt'が存在する)
      const settings: StorageNodeShareSettings = { isPublic: true, uids: ['ichiro'] }
      const actual = await storageService.setDirShareSettings(`${TEST_FILES_DIR}/XXX`, settings)

      const verify = (nodes: StorageNode[]) => {
        expect(nodes.length).toBe(0)
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual))
    })
  })

  describe('setUserDirShareSettings', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)

      // ディレクトリを作成
      await storageService.createDirs([`d1`], `${userDirPath}`)

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems, `${userDirPath}`)

      const actual = await storageService.setUserDirShareSettings(STORAGE_TEST_USER, `d1`, { isPublic: true })

      const verify = (nodes: StorageNode[]) => {
        expect(nodes.length).toBe(2)
        expect(nodes[0].path).toBe(`d1`)
        expect(nodes[1].path).toBe(`d1/fileA.txt`)

        for (const node of nodes) {
          expect(node.share).toEqual({ isPublic: true, uids: [] } as StorageNodeShareSettings)
        }
      }
      verify(actual)
      verify(await getNodesByActualNodes(actual, `${userDirPath}`))
    })
  })

  describe('setFileShareSettings', () => {
    beforeEach(async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems)
    })

    it('共有設定 - 設定なしの状態から公開フラグを設定', async () => {
      const actual = await storageService.setFileShareSettings(`${TEST_FILES_DIR}/d1/fileA.txt`, { isPublic: true })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
        expect(node.share).toEqual({ isPublic: true, uids: [] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await storageService.getFileNode(actual.path))
    })

    it('共有設定 - 設定なしの状態からユーザーIDを設定', async () => {
      const actual = await storageService.setFileShareSettings(`${TEST_FILES_DIR}/d1/fileA.txt`, { uids: ['ichiro'] })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
        expect(node.share).toEqual({ isPublic: false, uids: ['ichiro'] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await storageService.getFileNode(actual.path))
    })

    it('共有設定 - 公開フラグがオンの状態からオフへ設定', async () => {
      // 公開フラグをオフに設定しておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { isPublic: true })

      // 公開フラグをオンに設定
      const actual = await storageService.setFileShareSettings(`${TEST_FILES_DIR}/d1/fileA.txt`, { isPublic: false })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
        expect(node.share).toEqual(EMPTY_SHARE_SETTINGS)
      }
      verify(actual)
      verify(await storageService.getFileNode(actual.path))
    })

    it('共有設定 - ユーザーIDが設定されているの状態からユーザーIDを未設定へ変更', async () => {
      // ユーザーIDを設定しておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })

      // ユーザーIDを未設定へ変更
      const actual = await storageService.setFileShareSettings(`${TEST_FILES_DIR}/d1/fileA.txt`, { uids: [] })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
        expect(node.share).toEqual(EMPTY_SHARE_SETTINGS)
      }
      verify(actual)
      verify(await storageService.getFileNode(actual.path))
    })

    it('存在しないファイルを指定した場合', async () => {
      let actual: Error
      try {
        await storageService.setFileShareSettings(`${TEST_FILES_DIR}/d1/zzz.txt`, { isPublic: true })
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The specified file does not exist: '${TEST_FILES_DIR}/d1/zzz.txt'`)
    })

    it('nullを指定した場合', async () => {
      // 共有設定をしておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}/d1`, { isPublic: true, uids: ['ichiro'] })

      // nullを指定
      const actual = await storageService.setFileShareSettings(`${TEST_FILES_DIR}/d1/fileA.txt`, null)

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
        expect(node.share).toEqual(EMPTY_SHARE_SETTINGS)
      }
      verify(actual)
      verify(await storageService.getFileNode(actual.path))
    })

    it('basePathを指定した場合', async () => {
      const settings: StorageNodeShareSettings = { isPublic: true, uids: ['ichiro'] }
      const actual = await storageService.setFileShareSettings(`d1/fileA.txt`, settings, `${TEST_FILES_DIR}`)

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual(settings)
      }
      verify(actual)
      verify(await storageService.getFileNode(actual.path, `${TEST_FILES_DIR}`))
    })

    it(`filePath、basePathの先頭・末尾に'/'を付与`, async () => {
      const settings: StorageNodeShareSettings = { isPublic: true, uids: ['ichiro'] }
      const actual = await storageService.setFileShareSettings(`/d1/fileA.txt/`, settings, `/${TEST_FILES_DIR}/`)

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual(settings)
      }
      verify(actual)
      verify(await storageService.getFileNode(actual.path, `${TEST_FILES_DIR}`))
    })
  })

  describe('setUserFileShareSettings', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)

      // ディレクトリを作成
      await storageService.createDirs([`d1`], `${userDirPath}`)

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(uploadItems, `${userDirPath}`)

      const settings: StorageNodeShareSettings = { isPublic: true, uids: ['ichiro'] }
      const actual = await storageService.setUserFileShareSettings(STORAGE_TEST_USER, `d1/fileA.txt`, settings)

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual(settings)
      }
      verify(actual)
      verify(await storageService.getFileNode(actual.path, `${userDirPath}`))
    })
  })

  describe('getSignedUploadUrls', () => {
    it('ベーシックケース', async () => {
      const requestOrigin = config.cors.whitelist[0]
      const inputs: SignedUploadUrlInput[] = [
        { filePath: `${TEST_FILES_DIR}/fileA.txt`, contentType: 'text/plain' },
        { filePath: `${TEST_FILES_DIR}/fileB.txt`, contentType: 'text/plain' },
      ]

      const actual = await storageService.getSignedUploadUrls(requestOrigin, inputs)

      expect(actual.length).toBe(2)
    })
  })

  describe('getNode', () => {
    it('ディレクトリの取得', async () => {
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      const actual = await storageService.getNode(`${TEST_FILES_DIR}/d1/`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.exists).toBeTruthy()
      await existsNodes([actual])
    })

    it('ディレクトリの取得 - basePathを指定', async () => {
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      const actual = await storageService.getNode(`d1/`, `${TEST_FILES_DIR}`)

      expect(actual.path).toBe(`d1`)
      expect(actual.exists).toBeTruthy()
      await existsNodes([actual], `${TEST_FILES_DIR}`)
    })

    it(`ディレクトリの取得 - basePathを指定 - パスの先頭・末尾に'/'を付与`, async () => {
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      const actual = await storageService.getNode(`/d1/`, `/${TEST_FILES_DIR}/`)

      expect(actual.path).toBe(`d1`)
      expect(actual.exists).toBeTruthy()
      await existsNodes([actual], `${TEST_FILES_DIR}`)
    })

    it(`ディレクトリの取得 - 引数のパス指定で末尾に'/'を付与しない場合`, async () => {
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      // 末尾に'/'を付与しない
      const actual = await storageService.getNode(`${TEST_FILES_DIR}/d1`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      // 末尾に'/'を付与しなかったので存在しなことになってしまう
      expect(actual.exists).toBeFalsy()
    })

    it('ファイルの取得', async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.getNode(`${TEST_FILES_DIR}/d1/fileA.txt`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(actual.exists).toBeTruthy()
      await existsNodes([actual])
    })

    it('ファイルの取得 - basePathを指定', async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.getNode(`d1/fileA.txt`, `${TEST_FILES_DIR}`)

      expect(actual.path).toBe(`d1/fileA.txt`)
      expect(actual.exists).toBeTruthy()
      await existsNodes([actual], `${TEST_FILES_DIR}`)
    })

    it(`ファイルの取得 - basePathを指定 - パスの先頭・末尾に'/'を付与`, async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // パスの先頭・末尾に'/'を付与
      const actual = await storageService.getNode(`/d1/fileA.txt`, `/${TEST_FILES_DIR}/`)

      expect(actual.path).toBe(`d1/fileA.txt`)
      expect(actual.exists).toBeTruthy()
      await existsNodes([actual], `${TEST_FILES_DIR}`)
    })
  })

  describe('getDirNode', () => {
    it('ベーシックケース', async () => {
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      const actual = await storageService.getDirNode(`${TEST_FILES_DIR}/d1`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.exists).toBeTruthy()
      await existsNodes([actual])
    })

    it(`dirPathの先頭・末尾に'/'を付与`, async () => {
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      // パスの先頭・末尾に'/'を付与
      const actual = await storageService.getDirNode(`/${TEST_FILES_DIR}/d1/`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.exists).toBeTruthy()
      await existsNodes([actual])
    })
  })

  describe('getFileNode', () => {
    it('ベーシックケース', async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.getFileNode(`${TEST_FILES_DIR}/d1/fileA.txt`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(actual.exists).toBeTruthy()
      await existsNodes([actual])
    })

    it(`filePathの先頭に'/'を付与`, async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // パスの先頭に'/'を付与
      const actual = await storageService.getFileNode(`/${TEST_FILES_DIR}/d1/fileA.txt`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(actual.exists).toBeTruthy()
      await existsNodes([actual])
    })
  })

  describe('getDirAndDescendantMap', () => {
    it('ディレクトリを作成した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.getDirAndDescendantMap(`${TEST_FILES_DIR}/d1`)

      expect(Object.keys(actual).length).toBe(3)
      expect(actual[`${TEST_FILES_DIR}/d1`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1/fileA.txt`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1/fileB.txt`].exists).toBeTruthy()
    })

    it('ディレクトリを作成しなかった場合', async () => {
      // ディレクトリを作成せずファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.getDirAndDescendantMap(`${TEST_FILES_DIR}/d1`)

      expect(Object.keys(actual).length).toBe(2)
      expect(actual[`${TEST_FILES_DIR}/d1/fileA.txt`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1/fileB.txt`].exists).toBeTruthy()
    })

    it('dirPathを指定せず、basePathを指定した場合', async () => {
      // ディレクトリを作成せずファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.getDirAndDescendantMap(undefined, `${TEST_FILES_DIR}`)

      expect(Object.keys(actual).length).toBe(2)
      expect(actual[`d1/fileA.txt`].exists).toBeTruthy()
      expect(actual[`d1/fileB.txt`].exists).toBeTruthy()
    })

    it(`dirPath、basePathの先頭・末尾に'/'を付与した場合`, async () => {
      // ディレクトリを作成せずファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // パスの先頭・末尾に'/'を付与
      const actual = await storageService.getDirAndDescendantMap(`/d1/`, `/${TEST_FILES_DIR}/`)

      expect(Object.keys(actual).length).toBe(2)
      expect(actual[`d1/fileA.txt`].exists).toBeTruthy()
      expect(actual[`d1/fileB.txt`].exists).toBeTruthy()
    })
  })

  describe('Serve files', () => {
    //--------------------------------------------------
    //  Test helpers
    //--------------------------------------------------

    const STORAGE_TEST_USER_HEADER = { Authorization: `Bearer ${JSON.stringify(STORAGE_TEST_USER)}` }

    const APP_ADMIN_USER_HEADER = { Authorization: `Bearer ${JSON.stringify(APP_ADMIN_USER)}` }

    @Module({
      imports: [MockBaseAppModule, MockRESTContainerModule],
    })
    class MockAppModule {}

    let app: any

    beforeEach(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [MockAppModule],
      }).compile()

      app = moduleFixture.createNestApplication()
      await app.init()
    })

    //--------------------------------------------------
    //  Tests
    //--------------------------------------------------

    describe('serveFile', () => {
      it('画像ファイルをダウンロード', async () => {
        const localFilePath = `${__dirname}/${TEST_FILES_DIR}/desert.jpg`
        const userDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)
        const toFilePath = `${userDirPath}/d1/desert.jpg`
        await storageService.uploadLocalFiles([{ localFilePath, toFilePath }])

        return request(app.getHttpServer())
          .get(`/api/storage/${toFilePath}`)
          .set({ ...STORAGE_TEST_USER_HEADER })
          .expect(200)
          .then((res: Response) => {
            const localFileBuffer = fs.readFileSync(localFilePath)
            expect(res.body).toEqual(localFileBuffer)
          })
      })

      it('テキストファイルをダウンロード', async () => {
        const userDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)
        const uploadItem: UploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles([uploadItem])

        return request(app.getHttpServer())
          .get(`/api/storage/${uploadItem.path}`)
          .set({ ...STORAGE_TEST_USER_HEADER })
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(uploadItem.data)
          })
      })

      it('If-Modified-Sinceの検証', async () => {
        const userDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)
        const uploadItem: UploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        }
        const uploadedFileNode = (await storageService.uploadAsFiles([uploadItem]))[0]

        return request(app.getHttpServer())
          .get(`/api/storage/${uploadItem.path}`)
          .set({ ...STORAGE_TEST_USER_HEADER })
          .set('If-Modified-Since', uploadedFileNode.updated!.toString())
          .expect(304)
      })

      it('存在しないファイルを指定', async () => {
        const userDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)
        const uploadItem: UploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        }

        return request(app.getHttpServer())
          .get(`/api/storage/${uploadItem.path}`)
          .set({ ...STORAGE_TEST_USER_HEADER })
          .expect(404)
      })
    })

    describe('serveAppFile', () => {
      it('アプリケーション管理者の場合 - ファイルが公開されていない場合', async () => {
        const uploadItem: UploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles([uploadItem])

        return request(app.getHttpServer())
          .get(`/api/storage/${uploadItem.path}`)
          .set({ ...APP_ADMIN_USER_HEADER })
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(uploadItem.data)
          })
      })

      it('アプリケーション管理者以外でない場合 - ファイルが公開されていない場合', async () => {
        const uploadItem: UploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles([uploadItem])

        return (
          request(app.getHttpServer())
            .get(`/api/storage/${uploadItem.path}`)
            // アプリケーション管理者以外を設定
            .set({ ...STORAGE_TEST_USER_HEADER })
            .expect(403)
        )
      })

      it('アプリケーション管理者以外でない場合 - ファイルが公開されている場合', async () => {
        const uploadItem: UploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles([uploadItem])
        // ファイルの公開フラグをオンに設定
        await storageService.setFileShareSettings(uploadItem.path, { isPublic: true })

        return (
          request(app.getHttpServer())
            .get(`/api/storage/${uploadItem.path}`)
            // アプリケーション管理者以外を設定
            .set({ ...STORAGE_TEST_USER_HEADER })
            .expect(200)
            .then((res: Response) => {
              expect(res.text).toEqual(uploadItem.data)
            })
        )
      })

      it('アプリケーション管理者以外でない場合 - ファイルの共有ユーザーIDにマッチする場合', async () => {
        const uploadItem: UploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles([uploadItem])
        // ファイルの共有ユーザーIDを設定
        await storageService.setFileShareSettings(uploadItem.path, { uids: [STORAGE_TEST_USER.uid] })

        return (
          request(app.getHttpServer())
            .get(`/api/storage/${uploadItem.path}`)
            // 共有ユーザーIDにマッチするユーザーを設定
            .set({ ...STORAGE_TEST_USER_HEADER })
            .expect(200)
            .then((res: Response) => {
              expect(res.text).toEqual(uploadItem.data)
            })
        )
      })
    })

    describe('serveUserFile', () => {
      it('自ユーザーの場合 - ファイルが公開されていない場合', async () => {
        const userDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)
        const uploadItem: UploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles([uploadItem])

        return request(app.getHttpServer())
          .get(`/api/storage/${uploadItem.path}`)
          .set({ ...STORAGE_TEST_USER_HEADER })
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(uploadItem.data)
          })
      })

      it('他ユーザーの場合 - ファイルが公開されている場合', async () => {
        const userDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)
        const uploadItem: UploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles([uploadItem])
        // ファイルの公開フラグをオンに設定
        await storageService.setFileShareSettings(uploadItem.path, { isPublic: true })

        return request(app.getHttpServer())
          .get(`/api/storage/${uploadItem.path}`)
          .set({ ...APP_ADMIN_USER_HEADER })
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(uploadItem.data)
          })
      })

      it('他ユーザーの場合 - ファイルが公開されていない場合', async () => {
        const userDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)
        const uploadItem: UploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles([uploadItem])

        return request(app.getHttpServer())
          .get(`/api/storage/${uploadItem.path}`)
          .set({ ...APP_ADMIN_USER_HEADER })
          .expect(403)
      })

      it('他ユーザーの場合 - ファイルの共有ユーザーIDにマッチする場合', async () => {
        const userDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)
        const uploadItem: UploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles([uploadItem])
        // ファイルの共有ユーザーIDを設定
        await storageService.setFileShareSettings(uploadItem.path, { uids: [APP_ADMIN_USER.uid] })

        return (
          request(app.getHttpServer())
            .get(`/api/storage/${uploadItem.path}`)
            // 共有ユーザーIDにマッチするユーザーを設定
            .set({ ...APP_ADMIN_USER_HEADER })
            .expect(200)
            .then((res: Response) => {
              expect(res.text).toEqual(uploadItem.data)
            })
        )
      })
    })
  })

  describe('uploadLocalFiles', () => {
    it('単一ファイルをアップロード', async () => {
      const localFilePath = `${__dirname}/${TEST_FILES_DIR}/fileA.txt`
      const toFilePath = `${TEST_FILES_DIR}/d1/fileA.txt`

      const actual = await storageService.uploadLocalFiles([{ localFilePath, toFilePath }])

      expect(actual[0].nodeType).toBe(StorageNodeType.File)
      expect(actual[0].name).toBe('fileA.txt')
      expect(actual[0].dir).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(dayjs(actual[0].created).isValid()).toBeTruthy()
      expect(dayjs(actual[0].updated).isValid()).toBeTruthy()

      const toDirNodes = await storageService.getDirAndDescendants(`${TEST_FILES_DIR}/d1`)
      expect(toDirNodes.length).toBe(3)
      expect(toDirNodes[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(toDirNodes[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(toDirNodes[2].path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
    })

    it(`単一ファイルをアップロード - toFilePathの先頭に'/'を付与`, async () => {
      const localFilePath = `${__dirname}/${TEST_FILES_DIR}/fileA.txt`
      const toFilePath = `/${TEST_FILES_DIR}/d1/fileA.txt` // ← 先頭に'/'を付与

      const actual = await storageService.uploadLocalFiles([{ localFilePath, toFilePath }])

      expect(actual[0].nodeType).toBe(StorageNodeType.File)
      expect(actual[0].name).toBe('fileA.txt')
      expect(actual[0].dir).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(dayjs(actual[0].created).isValid()).toBeTruthy()
      expect(dayjs(actual[0].updated).isValid()).toBeTruthy()

      const toDirNodes = await storageService.getDirAndDescendants(`${TEST_FILES_DIR}/d1`)
      expect(toDirNodes.length).toBe(3)
      expect(toDirNodes[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(toDirNodes[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(toDirNodes[2].path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
    })

    it('単一ファイルをアップロード - basePathを指定', async () => {
      const localFilePath = `${__dirname}/${TEST_FILES_DIR}/fileA.txt`
      const toFilePath = `d1/fileA.txt`

      const actual = await storageService.uploadLocalFiles([{ localFilePath, toFilePath }], `${TEST_FILES_DIR}`) // ← basePathを指定

      expect(actual[0].nodeType).toBe(StorageNodeType.File)
      expect(actual[0].name).toBe('fileA.txt')
      expect(actual[0].dir).toBe('d1') // ← 'd1'になる
      expect(actual[0].path).toBe(`d1/fileA.txt`) // ← パスにbasePathは含まれない
      expect(dayjs(actual[0].created).isValid()).toBeTruthy()
      expect(dayjs(actual[0].updated).isValid()).toBeTruthy()

      const toDirNodes = await storageService.getDirAndDescendants(`${TEST_FILES_DIR}/d1`)
      expect(toDirNodes.length).toBe(3)
      expect(toDirNodes[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(toDirNodes[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(toDirNodes[2].path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
    })

    it(`単一ファイルをアップロード - basePathの先頭・末尾に'/'を付与`, async () => {
      const localFilePath = `${__dirname}/${TEST_FILES_DIR}/fileA.txt`
      const toFilePath = `d1/fileA.txt`

      // basePathの先頭・末尾に'/'を付与
      const actual = await storageService.uploadLocalFiles([{ localFilePath, toFilePath }], `/${TEST_FILES_DIR}/`)

      expect(actual[0].nodeType).toBe(StorageNodeType.File)
      expect(actual[0].name).toBe('fileA.txt')
      expect(actual[0].dir).toBe('d1')
      expect(actual[0].path).toBe(`d1/fileA.txt`)
      expect(dayjs(actual[0].created).isValid()).toBeTruthy()
      expect(dayjs(actual[0].updated).isValid()).toBeTruthy()

      const toDirNodes = await storageService.getDirAndDescendants(`${TEST_FILES_DIR}/d1`)
      expect(toDirNodes.length).toBe(3)
      expect(toDirNodes[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(toDirNodes[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(toDirNodes[2].path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
    })

    it('複数ファイルをアップロード', async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileB.txt`,
        },
      ]

      const actual = await storageService.uploadLocalFiles(uploadList)

      for (let i = 0; i < actual.length; i++) {
        expect(actual[i].nodeType).toBe(StorageNodeType.File)
        expect(actual[i].name).toBe(path.basename(uploadList[i].toFilePath))
        expect(actual[i].dir).toBe(`${TEST_FILES_DIR}/d1`)
        expect(actual[i].path).toBe(uploadList[i].toFilePath)
        expect(dayjs(actual[i].created).isValid()).toBeTruthy()
        expect(dayjs(actual[i].updated).isValid()).toBeTruthy()
      }

      const toDirNodes = await storageService.getDirAndDescendants(`${TEST_FILES_DIR}/d1`)
      expect(toDirNodes.length).toBe(4)
      expect(toDirNodes[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(toDirNodes[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(toDirNodes[2].path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(toDirNodes[3].path).toBe(`${TEST_FILES_DIR}/d1/fileB.txt`)
    })

    it('存在しないローカルファイルを指定した場合', async () => {
      const fileName = 'fileXXX.txt'
      const localFilePath = path.join(__dirname, TEST_FILES_DIR, fileName)
      const toFilePath = path.join(TEST_FILES_DIR, fileName)

      let actual!: any
      try {
        await storageService.uploadLocalFiles([{ localFilePath, toFilePath }])
      } catch (err) {
        actual = err
      }

      expect(actual.code).toBe('ENOENT')
    })
  })

  /**
   * TODO Jest did not exit one second after the test run has completed.
   * admin.auth()の非同期メソッド`getUser()`などを実行すると上記警告が発生する
   */
  describe('assignUserDir', () => {
    beforeEach(async () => {
      await removeUserRootDir()
    })

    afterEach(async () => {
      await removeUserRootDir()
    })

    async function removeUserRootDir(): Promise<void> {
      // ユーザーディレクトリのパスを取得
      const user = await admin.auth().getUser(STORAGE_TEST_USER.uid)
      let userDirPath
      try {
        userDirPath = storageService.getUserDirPath(user)
      } catch (err) {
        // ユーザーディレクトリが割り当てられていない状態でgetUserDirPath()すると
        // エラーが発生するのでtry-catchしている
      }

      if (userDirPath) {
        // ユーザーディレクトリを削除
        await storageService.removeDirs([userDirPath])
        // カスタムクレイムのユーザーディレクトリ名をクリア
        await admin.auth().setCustomUserClaims(STORAGE_TEST_USER.uid, { myDirName: undefined })
      }
    }

    it('ベーシックケース', async () => {
      await storageService.assignUserDir({
        uid: STORAGE_TEST_USER.uid,
        myDirName: undefined,
      })

      expect(true).toBeTruthy()

      const afterUser = await admin.auth().getUser(STORAGE_TEST_USER.uid)
      // カスタムクレイムのユーザーディレクトリ名が設定されたか検証
      expect((afterUser.customClaims as any).myDirName).toBeDefined()
      // ユーザーディレクトリが作成されたか検証
      const userDirPath = storageService.getUserDirPath(afterUser)
      const userDirNode = await storageService.getDirNode(userDirPath)
      expect(userDirNode.exists).toBeTruthy()
    })

    it('カスタムクレイムにユーザーディレクトリ名が割り当てられてられているが、ユーザーディレクトリは存在しない場合', async () => {
      // カスタムクレイムのユーザーディレクトリ名を設定
      await admin.auth().setCustomUserClaims(STORAGE_TEST_USER.uid, { myDirName: STORAGE_TEST_USER.myDirName })

      await storageService.assignUserDir(STORAGE_TEST_USER)

      const afterUser = await admin.auth().getUser(STORAGE_TEST_USER.uid)
      // カスタムクレイムのユーザーディレクトリ名に変化がないことを検証
      expect((afterUser.customClaims as any).myDirName).toBe(STORAGE_TEST_USER.myDirName)
      // ユーザーディレクトリが作成されたか検証
      const userDirPath = storageService.getUserDirPath(afterUser)
      const userDirNode = await storageService.getDirNode(userDirPath)
      expect(userDirNode.exists).toBeTruthy()
    })

    it('カスタムクレイムにユーザーディレクトリ名が割り当てられていて、かつユーザーディレクトリも存在する場合', async () => {
      // カスタムクレイムのユーザーディレクトリ名を設定
      await admin.auth().setCustomUserClaims(STORAGE_TEST_USER.uid, { myDirName: STORAGE_TEST_USER.myDirName })
      // ユーザーディレクトリを作成
      const beforeUserDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)
      const beforeUserDirNode = (await storageService.createDirs([beforeUserDirPath]))[0]

      await storageService.assignUserDir(STORAGE_TEST_USER)

      const afterUser = await admin.auth().getUser(STORAGE_TEST_USER.uid)
      // カスタムクレイムのユーザーディレクトリ名に変化がないことを検証
      expect((afterUser.customClaims as any).myDirName).toBe(STORAGE_TEST_USER.myDirName)
      // ユーザーディレクトリに変化がないことを検証
      const afterUserDirPath = storageService.getUserDirPath(afterUser)
      expect(afterUserDirPath).toBe(beforeUserDirPath)
      const afterUserDirNode = await storageService.getDirNode(afterUserDirPath)
      expect(afterUserDirNode.created).toEqual(beforeUserDirNode.created)
    })
  })

  describe('getUserDirPath', () => {
    it('ベーシックケース - user.myDirName', async () => {
      const actual = storageService.getUserDirPath(STORAGE_TEST_USER)
      expect(actual).toBe(`users/${STORAGE_TEST_USER.myDirName}`)
    })

    it('ベーシックケース - user.customClaims.myDirName', async () => {
      const user = {
        uid: STORAGE_TEST_USER.uid,
        customClaims: {
          myDirName: STORAGE_TEST_USER.myDirName,
        },
      }

      const actual = storageService.getUserDirPath(user)
      expect(actual).toBe(`users/${user.customClaims.myDirName}`)
    })

    it('user.myDirNameが設定されていない場合', async () => {
      const user = cloneDeep(STORAGE_TEST_USER)
      user.myDirName = undefined

      let actual!: Error
      try {
        storageService.getUserDirPath(user)
      } catch (err) {
        actual = err
      }

      expect(actual).toBeDefined()
    })

    it('user.customClaims.myDirNameが設定されていない場合', async () => {
      const user = {
        uid: STORAGE_TEST_USER.uid,
        customClaims: {
          myDirName: undefined,
        },
      }

      let actual!: Error
      try {
        storageService.getUserDirPath(user)
      } catch (err) {
        actual = err
      }

      expect(actual).toBeDefined()
    })
  })

  describe('toStorageNode', () => {
    it('ディレクトリノードの変換', async () => {
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])
      const nodeMap = await storageService.getDirAndDescendantMap(`${TEST_FILES_DIR}/d1`)

      const actual = storageService.toStorageNode(nodeMap[`${TEST_FILES_DIR}/d1`].gcsNode!)

      expect(actual.nodeType).toBe(StorageNodeType.Dir)
      expect(actual.name).toBe(`d1`)
      expect(actual.dir).toBe(`${TEST_FILES_DIR}`)
      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.contentType).toBe('')
      expect(actual.size).toBe(0)
      expect(dayjs(actual.created).isValid()).toBeTruthy()
      expect(dayjs(actual.updated).isValid()).toBeTruthy()
      expect(actual.exists).toBeTruthy()
      expect(actual.gcsNode).toBeDefined()
    })

    it('ファイルノードの変換', async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)
      const nodeMap = await storageService.getDirAndDescendantMap(`${TEST_FILES_DIR}/d1`)

      const actual = storageService.toStorageNode(nodeMap[`${TEST_FILES_DIR}/d1/fileA.txt`].gcsNode!)

      expect(actual.nodeType).toBe(StorageNodeType.File)
      expect(actual.name).toBe(`fileA.txt`)
      expect(actual.dir).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(actual.contentType).toBe('text/plain; charset=utf-8')
      expect(actual.size).toBeGreaterThan(0)
      expect(dayjs(actual.created).isValid()).toBeTruthy()
      expect(dayjs(actual.updated).isValid()).toBeTruthy()
      expect(actual.exists).toBeTruthy()
      expect(actual.gcsNode).toBeDefined()
    })

    it('basePathを指定した場合', async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // gcsNodeを取得
      const nodeMap = await storageService.getDirAndDescendantMap(`${TEST_FILES_DIR}/d1`)

      const actual = storageService.toStorageNode(nodeMap[`${TEST_FILES_DIR}/d1/fileA.txt`].gcsNode!, `${TEST_FILES_DIR}`)

      expect(actual.nodeType).toBe(StorageNodeType.File)
      expect(actual.name).toBe(`fileA.txt`)
      expect(actual.dir).toBe(`d1`)
      expect(actual.path).toBe(`d1/fileA.txt`)
      expect(actual.contentType).toBe('text/plain; charset=utf-8')
      expect(actual.size).toBeGreaterThan(0)
      expect(dayjs(actual.created).isValid()).toBeTruthy()
      expect(dayjs(actual.updated).isValid()).toBeTruthy()
      expect(actual.exists).toBeTruthy()
      expect(actual.gcsNode).toBeDefined()
    })
  })

  describe('toStorageNodeByDir', () => {
    it('ベーシックケース', async () => {
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      const actual = storageService.toStorageNodeByDir(`${TEST_FILES_DIR}/d1`)

      expect(actual.nodeType).toBe(StorageNodeType.Dir)
      expect(actual.name).toBe(`d1`)
      expect(actual.dir).toBe(`${TEST_FILES_DIR}`)
      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.created).toEqual(dayjs(0))
      expect(actual.updated).toEqual(dayjs(0))
    })
  })

  describe('sortStorageNodes', () => {
    it('昇順でソート', async () => {
      const d1: StorageNode = {
        nodeType: StorageNodeType.Dir,
        name: 'd1',
        dir: '',
        path: 'd1',
        contentType: '',
        size: 0,
        share: Object.assign({}, EMPTY_SHARE_SETTINGS),
        created: dayjs(0),
        updated: dayjs(0),
      }
      const d11: StorageNode = {
        nodeType: StorageNodeType.Dir,
        name: 'd11',
        dir: 'd1',
        path: 'd1/d11',
        contentType: '',
        size: 0,
        share: Object.assign({}, EMPTY_SHARE_SETTINGS),
        created: dayjs(0),
        updated: dayjs(0),
      }
      const fileA: StorageNode = {
        nodeType: StorageNodeType.File,
        name: 'fileA.txt',
        dir: 'd1/d11',
        path: 'd1/d11/fileA.txt',
        contentType: '',
        size: 0,
        share: Object.assign({}, EMPTY_SHARE_SETTINGS),
        created: dayjs(0),
        updated: dayjs(0),
      }
      const d12: StorageNode = {
        nodeType: StorageNodeType.Dir,
        name: 'd12',
        dir: 'd1',
        path: 'd1/d12',
        contentType: '',
        size: 0,
        share: Object.assign({}, EMPTY_SHARE_SETTINGS),
        created: dayjs(0),
        updated: dayjs(0),
      }
      const fileB: StorageNode = {
        nodeType: StorageNodeType.File,
        name: 'fileB.txt',
        dir: 'd1/d12',
        path: 'd1/d12/fileB.txt',
        contentType: '',
        size: 0,
        share: Object.assign({}, EMPTY_SHARE_SETTINGS),
        created: dayjs(0),
        updated: dayjs(0),
      }
      const d2: StorageNode = {
        nodeType: StorageNodeType.Dir,
        name: 'd2',
        dir: '',
        path: 'd2',
        contentType: '',
        size: 0,
        share: Object.assign({}, EMPTY_SHARE_SETTINGS),
        created: dayjs(0),
        updated: dayjs(0),
      }
      const fileC: StorageNode = {
        nodeType: StorageNodeType.File,
        name: 'fileC.txt',
        dir: 'd2',
        path: 'd2/fileC.txt',
        contentType: '',
        size: 0,
        share: Object.assign({}, EMPTY_SHARE_SETTINGS),
        created: dayjs(0),
        updated: dayjs(0),
      }
      const fileD: StorageNode = {
        nodeType: StorageNodeType.File,
        name: 'fileD.txt',
        dir: '',
        path: 'fileD.txt',
        contentType: '',
        size: 0,
        share: Object.assign({}, EMPTY_SHARE_SETTINGS),
        created: dayjs(0),
        updated: dayjs(0),
      }
      const fileE: StorageNode = {
        nodeType: StorageNodeType.File,
        name: 'fileE.txt',
        dir: '',
        path: 'fileE.txt',
        contentType: '',
        size: 0,
        share: Object.assign({}, EMPTY_SHARE_SETTINGS),
        created: dayjs(0),
        updated: dayjs(0),
      }

      const nodes = [fileA, fileB, fileC, fileE, fileD, d1, d2, d11, d12]
      storageService.sortStorageNodes(nodes)

      expect(nodes[0]).toBe(d1)
      expect(nodes[1]).toBe(d11)
      expect(nodes[2]).toBe(fileA)
      expect(nodes[3]).toBe(d12)
      expect(nodes[4]).toBe(fileB)
      expect(nodes[5]).toBe(d2)
      expect(nodes[6]).toBe(fileC)
      expect(nodes[7]).toBe(fileD)
      expect(nodes[8]).toBe(fileE)
    })
  })

  describe('padVirtualDirNode', () => {
    it('topPathを指定しない場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      // ファイルのアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/d2/d21/fileB.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileC.txt`,
          toFilePath: `${TEST_FILES_DIR}/fileC.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // 引数にトップレベルのディレクトリを指定
      const nodeMap = await storageService.getDirAndDescendantMap(`${TEST_FILES_DIR}`)

      // 穴埋めされる前の状態
      expect(Object.keys(nodeMap).length).toBe(5)
      expect(nodeMap[`${TEST_FILES_DIR}`].path).toBe(`${TEST_FILES_DIR}`)
      expect(nodeMap[`${TEST_FILES_DIR}/d1`].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(nodeMap[`${TEST_FILES_DIR}/d1/fileA.txt`].path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(nodeMap[`${TEST_FILES_DIR}/d2/d21/fileB.txt`].path).toBe(`${TEST_FILES_DIR}/d2/d21/fileB.txt`)
      expect(nodeMap[`${TEST_FILES_DIR}/fileC.txt`].path).toBe(`${TEST_FILES_DIR}/fileC.txt`)

      const actual = await storageService.padVirtualDirNode(nodeMap, null)

      // 穴埋めされたディレクトリ
      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d2`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d2/d21`)

      // 穴埋めされた後の状態
      expect(Object.keys(nodeMap).length).toBe(7)
      expect(nodeMap[`${TEST_FILES_DIR}`].path).toBe(`${TEST_FILES_DIR}`)
      expect(nodeMap[`${TEST_FILES_DIR}/d1`].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(nodeMap[`${TEST_FILES_DIR}/d1/fileA.txt`].path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(nodeMap[`${TEST_FILES_DIR}/d2`].path).toBe(`${TEST_FILES_DIR}/d2`)
      expect(nodeMap[`${TEST_FILES_DIR}/d2/d21`].path).toBe(`${TEST_FILES_DIR}/d2/d21`)
      expect(nodeMap[`${TEST_FILES_DIR}/d2/d21/fileB.txt`].path).toBe(`${TEST_FILES_DIR}/d2/d21/fileB.txt`)
      expect(nodeMap[`${TEST_FILES_DIR}/fileC.txt`].path).toBe(`${TEST_FILES_DIR}/fileC.txt`)

      expect(nodeMap[`${TEST_FILES_DIR}`].exists).toBeTruthy()
      expect(nodeMap[`${TEST_FILES_DIR}/d1`].exists).toBeTruthy()
      expect(nodeMap[`${TEST_FILES_DIR}/d1/fileA.txt`].exists).toBeTruthy()
      expect(nodeMap[`${TEST_FILES_DIR}/d2`].exists).toBeFalsy() // ← 仮想的にディレクトリが作成された
      expect(nodeMap[`${TEST_FILES_DIR}/d2/d21`].exists).toBeFalsy() // ← 仮想的にディレクトリが作成された
      expect(nodeMap[`${TEST_FILES_DIR}/d2/d21/fileB.txt`].exists).toBeTruthy()
      expect(nodeMap[`${TEST_FILES_DIR}/fileC.txt`].exists).toBeTruthy()

      // 仮想的に作成されたGCSノードのパスを検証(末尾に'/'が付く)
      expect(nodeMap[`${TEST_FILES_DIR}/d2`].gcsNode.name).toBe(`${TEST_FILES_DIR}/d2/`)
      expect(nodeMap[`${TEST_FILES_DIR}/d2/d21`].gcsNode.name).toBe(`${TEST_FILES_DIR}/d2/d21/`)
    })

    it('topPathを指定しない場合 - basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      // ファイルのアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // basePathを指定
      const nodeMap = await storageService.getDirAndDescendantMap('d1', `${TEST_FILES_DIR}`)

      // 穴埋めされる前の状態
      expect(Object.keys(nodeMap).length).toBe(2)
      expect(nodeMap[`d1`].path).toBe(`d1`)
      expect(nodeMap[`d1/d11/fileA.txt`].path).toBe(`d1/d11/fileA.txt`)

      // basePathを指定
      const actual = await storageService.padVirtualDirNode(nodeMap, null, `${TEST_FILES_DIR}`)

      // 穴埋めされたディレクトリ
      expect(actual.length).toBe(1)
      expect(actual[0].path).toBe(`d1/d11`)

      // 穴埋めされた後の状態
      expect(Object.keys(nodeMap).length).toBe(3)
      expect(nodeMap[`d1`].path).toBe(`d1`)
      expect(nodeMap[`d1/d11`].path).toBe(`d1/d11`)
      expect(nodeMap[`d1/d11/fileA.txt`].path).toBe(`d1/d11/fileA.txt`)

      expect(nodeMap[`d1`].exists).toBeTruthy()
      expect(nodeMap[`d1/d11`].exists).toBeFalsy() // ← 仮想的にディレクトリが作成された
      expect(nodeMap[`d1/d11/fileA.txt`].exists).toBeTruthy()

      // 仮想的に作成されたGCSノードのパスを検証(末尾に'/'が付く)
      expect(nodeMap[`d1/d11`].gcsNode.name).toBe(`${TEST_FILES_DIR}/d1/d11/`)
    })

    it('topPathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      // ファイルのアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const nodeMap = await storageService.getDirAndDescendantMap(`${TEST_FILES_DIR}`)

      // 穴埋めされる前の状態
      expect(Object.keys(nodeMap).length).toBe(3)
      expect(nodeMap[`${TEST_FILES_DIR}`].path).toBe(`${TEST_FILES_DIR}`)
      expect(nodeMap[`${TEST_FILES_DIR}/d1`].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(nodeMap[`${TEST_FILES_DIR}/d1/d11/fileA.txt`].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)

      const actual = await storageService.padVirtualDirNode(nodeMap, `${TEST_FILES_DIR}/d1`)

      // 穴埋めされたディレクトリ
      expect(actual.length).toBe(1)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1/d11`)

      // 穴埋めされた後の状態
      expect(Object.keys(nodeMap).length).toBe(4)
      expect(nodeMap[`${TEST_FILES_DIR}`].path).toBe(`${TEST_FILES_DIR}`)
      expect(nodeMap[`${TEST_FILES_DIR}/d1`].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(nodeMap[`${TEST_FILES_DIR}/d1/d11`].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(nodeMap[`${TEST_FILES_DIR}/d1/d11/fileA.txt`].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)

      expect(nodeMap[`${TEST_FILES_DIR}`].exists).toBeTruthy()
      expect(nodeMap[`${TEST_FILES_DIR}/d1`].exists).toBeTruthy()
      expect(nodeMap[`${TEST_FILES_DIR}/d1/d11`].exists).toBeFalsy() // ← 仮想的にディレクトリが作成された
      expect(nodeMap[`${TEST_FILES_DIR}/d1/d11/fileA.txt`].exists).toBeTruthy()

      // 仮想的に作成されたGCSノードのパスを検証(末尾に'/'が付く)
      expect(nodeMap[`${TEST_FILES_DIR}/d1/d11`].gcsNode.name).toBe(`${TEST_FILES_DIR}/d1/d11/`)
    })

    it('topPathを指定した場合 - basePathを指定', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      // ファイルのアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const nodeMap = await storageService.getDirAndDescendantMap(undefined, `${TEST_FILES_DIR}`)

      // 穴埋めされる前の状態
      expect(Object.keys(nodeMap).length).toBe(2)
      expect(nodeMap[`d1`].path).toBe(`d1`)
      expect(nodeMap[`d1/d11/fileA.txt`].path).toBe(`d1/d11/fileA.txt`)

      const actual = await storageService.padVirtualDirNode(nodeMap, `d1`, `${TEST_FILES_DIR}`)

      // 穴埋めされたディレクトリ
      expect(actual.length).toBe(1)
      expect(actual[0].path).toBe(`d1/d11`)

      // 穴埋めされた後の状態
      expect(Object.keys(nodeMap).length).toBe(3)
      expect(nodeMap[`d1`].path).toBe(`d1`)
      expect(nodeMap[`d1/d11`].path).toBe(`d1/d11`)
      expect(nodeMap[`d1/d11/fileA.txt`].path).toBe(`d1/d11/fileA.txt`)

      expect(nodeMap[`d1`].exists).toBeTruthy()
      expect(nodeMap[`d1/d11`].exists).toBeFalsy() // ← 仮想的にディレクトリが作成された
      expect(nodeMap[`d1/d11/fileA.txt`].exists).toBeTruthy()

      // 仮想的に作成されたGCSノードのパスを検証(末尾に'/'が付く)
      expect(nodeMap[`d1/d11`].gcsNode.name).toBe(`${TEST_FILES_DIR}/d1/d11/`)
    })

    it(`dirPath、topPathの先頭・末尾に'/'を付与`, async () => {
      // ディレクトリを作成
      await storageService.createDirs([`${TEST_FILES_DIR}/d1`])

      // ファイルのアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const nodeMap = await storageService.getDirAndDescendantMap(undefined, `${TEST_FILES_DIR}`)

      // 穴埋めされる前の状態
      expect(Object.keys(nodeMap).length).toBe(2)
      expect(nodeMap[`d1`].path).toBe(`d1`)
      expect(nodeMap[`d1/d11/fileA.txt`].path).toBe(`d1/d11/fileA.txt`)

      // パスの先頭・末尾に'/'を付与
      const actual = await storageService.padVirtualDirNode(nodeMap, `/d1/`, `/${TEST_FILES_DIR}/`)

      // 穴埋めされたディレクトリ
      expect(actual.length).toBe(1)
      expect(actual[0].path).toBe(`d1/d11`)

      // 穴埋めされた後の状態
      expect(Object.keys(nodeMap).length).toBe(3)
      expect(nodeMap[`d1`].path).toBe(`d1`)
      expect(nodeMap[`d1/d11`].path).toBe(`d1/d11`)
      expect(nodeMap[`d1/d11/fileA.txt`].path).toBe(`d1/d11/fileA.txt`)

      expect(nodeMap[`d1`].exists).toBeTruthy()
      expect(nodeMap[`d1/d11`].exists).toBeFalsy() // ← 仮想的にディレクトリが作成された
      expect(nodeMap[`d1/d11/fileA.txt`].exists).toBeTruthy()

      // 仮想的に作成されたGCSノードのパスを検証(末尾に'/'が付く)
      expect(nodeMap[`d1/d11`].gcsNode.name).toBe(`${TEST_FILES_DIR}/d1/d11/`)
    })
  })

  describe('splitHierarchicalDirPaths', () => {
    it('ベーシックケース', async () => {
      const actual = storageService.splitHierarchicalDirPaths(`d1`, `d1/d11/fileA.txt`, 'd2/d21/fileC.txt', `d1/d11/fileB.txt`)

      expect(actual.length).toBe(7)
      expect(actual[0]).toBe(`d1`)
      expect(actual[1]).toBe(`d1/d11`)
      expect(actual[2]).toBe(`d1/d11/fileA.txt`)
      expect(actual[3]).toBe(`d1/d11/fileB.txt`)
      expect(actual[4]).toBe(`d2`)
      expect(actual[5]).toBe(`d2/d21`)
      expect(actual[6]).toBe(`d2/d21/fileC.txt`)
    })
  })

  describe('validatePath', () => {
    it('空の場合', async () => {
      let actual!: InputValidationError
      try {
        storageService.validatePath('')
      } catch (err) {
        actual = err
      }
      expect(actual).toBeDefined()
    })

    it(`'\\n'を含んでいる場合`, async () => {
      let actual!: InputValidationError
      try {
        storageService.validatePath('d1/d1\n1')
      } catch (err) {
        actual = err
      }
      expect(actual).toBeDefined()
    })

    it(`'\\r\\n'を含んでいる場合`, async () => {
      let actual!: InputValidationError
      try {
        storageService.validatePath('d1/d1\r\n1')
      } catch (err) {
        actual = err
      }
      expect(actual).toBeDefined()
    })

    it(`'\\t'を含んでいる場合`, async () => {
      let actual!: InputValidationError
      try {
        storageService.validatePath('d1/d1\t1')
      } catch (err) {
        actual = err
      }
      expect(actual).toBeDefined()
    })

    it(`'\\r'を含んでいる場合`, async () => {
      let actual!: InputValidationError
      try {
        storageService.validatePath('d1/d1\r1')
      } catch (err) {
        actual = err
      }
      expect(actual).toBeUndefined()
    })
  })

  describe('validateDirName', () => {
    it(`'/'を含んでいる場合`, async () => {
      let actual!: InputValidationError
      try {
        storageService.validateDirName(`d1/1`)
      } catch (err) {
        actual = err
      }
      expect(actual).toBeDefined()
    })

    it(`validatePath()の呼び出し確認`, async () => {
      const validatePath = td.replace(storageService, 'validatePath')

      await storageService.validateDirName(`d1`)

      const explanation = td.explain(validatePath)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(`d1`)
    })
  })

  describe('validateFileName', () => {
    it(`'/'を含んでいる場合`, async () => {
      let actual!: InputValidationError
      try {
        storageService.validateFileName(`file/A.txt`)
      } catch (err) {
        actual = err
      }
      expect(actual).toBeDefined()
    })

    it(`validatePath()の呼び出し確認`, async () => {
      const validatePath = td.replace(storageService, 'validatePath')

      await storageService.validateFileName(`fileA.txt`)

      const explanation = td.explain(validatePath)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(`fileA.txt`)
    })
  })
})
