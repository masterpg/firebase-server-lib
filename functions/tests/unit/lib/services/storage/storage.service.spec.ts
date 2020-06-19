import * as admin from 'firebase-admin'
import * as fs from 'fs'
import * as path from 'path'
import * as td from 'testdouble'
import { APP_ADMIN_USER, APP_ADMIN_USER_HEADER, STORAGE_USER, STORAGE_USER_HEADER, STORAGE_USER_TOKEN } from '../../../../helpers/common/data'
import {
  DevUtilsServiceDI,
  DevUtilsServiceModule,
  SignedUploadUrlInput,
  StorageFileNode,
  StorageNode,
  StorageNodeShareSettings,
  StorageNodeType,
  StorageService,
  StorageServiceDI,
  StorageUploadDataItem,
  StoreService,
  StoreServiceDI,
  initLib,
} from '../../../../../src/lib'
import { Test, TestingModule } from '@nestjs/testing'
import { removeStartDirChars, sleep } from 'web-base-lib'
import { MockStorageRESTModule } from '../../../../mocks/lib/rest/storage'
import { Response } from 'supertest'
import { config } from '../../../../../src/config'
import dayjs = require('dayjs')
import request = require('supertest')

jest.setTimeout(900000)
initLib()

//========================================================================
//
//  Test data
//
//========================================================================

const TEST_FILES_DIR = 'test-files'

//========================================================================
//
//  Test helpers
//
//========================================================================

let testingModule!: TestingModule
let storageService!: TestStorageService
let storeService!: StoreServiceDI.type
let devUtilsService!: DevUtilsServiceDI.type

type TestStorageService = StorageService & {
  sortNodes: StorageService['sortNodes']
  extractMetaData: StorageService['extractMetaData']
  saveMetadata: StorageService['saveMetadata']
  validatePath: StorageService['validatePath']
  validateDirName: StorageService['validateDirName']
  validateFileName: StorageService['validateFileName']
}

/**
 * 全てのノードを削除します。
 */
async function removeAllNodes(): Promise<void> {
  // バケットのファイルを削除
  const bucket = admin.storage().bucket()
  const [files] = await bucket.getFiles({ prefix: '' })
  await Promise.all(
    files.map(async file => {
      await file.delete()
    })
  )
  // ストアのノードを削除
  const nodes = await storeService.storageDao.where('path', '>=', '').fetch()
  await Promise.all(
    nodes.map(async node => {
      await storeService.storageDao.delete(node.id)
    })
  )
}

/**
 * 指定されたノードが存在することを検証します。
 * @param nodes
 */
async function existsNodes(nodes: StorageNode[]): Promise<void> {
  for (const node of nodes) {
    // ディレクトリの末尾が'/'でないことを検証
    expect(node.dir.endsWith('/')).toBeFalsy()
    // node.path が ｢node.dir + node.name｣ と一致することを検証
    expect(node.path).toBe(removeStartDirChars(path.join(node.dir, node.name)))
    // バージョンの検証
    expect(node.version >= 1).toBeTruthy()
    // タイムスタンプの検証
    expect(dayjs.isDayjs(node.createdAt)).toBeTruthy()
    expect(dayjs.isDayjs(node.updatedAt)).toBeTruthy()
    // ストアに対象ノードが存在することを確認
    expect(await storageService.getNodeByPath(node.path)).toMatchObject(node)
    expect(await storageService.getNodeById(node.id)).toMatchObject(node)
    // ノードがファイルの場合
    if (node.nodeType === StorageNodeType.File) {
      // ストレージに対象ファイルが存在することを検証
      const fileDetail = await storageService.getStorageFile(node.path)
      expect(fileDetail.exists).toBeTruthy()
      expect(fileDetail.version).toBe(node.version)
    }
  }
}

/**
 * 指定されたノードが存在しないことを検証します。
 * @param nodes
 */
async function notExistsNodes(nodes: StorageNode[]): Promise<void> {
  for (const node of nodes) {
    // node.path が ｢node.dir + node.name｣ と一致することを検証
    expect(node.path).toBe(path.join(node.dir, node.name))
    // バージョンの検証
    expect(node.version >= 1).toBeTruthy()
    // タイムスタンプの検証
    expect(dayjs.isDayjs(node.createdAt)).toBeTruthy()
    expect(dayjs.isDayjs(node.updatedAt)).toBeTruthy()
    // ストアに対象ノードが存在しないことを確認
    expect(await storageService.getNodeByPath(node.path)).toBeUndefined()
    expect(await storageService.getNodeById(node.id)).toBeUndefined()
    // ノードがファイルの場合
    if (node.nodeType === StorageNodeType.File) {
      // ストレージに対象ファイルが存在しないことを検証
      const fileDetail = await storageService.getStorageFile(node.path)
      expect(fileDetail.exists).toBeFalsy()
    }
  }
}

/**
 * 移動ノードの検証を行います。
 * @param fmNodes 移動前ノード ※移動する前に取得しておいたノード
 * @param toNodes 移動後ノード
 */
async function verifyMoveNodes(fmNodes: StorageNode[], toNodes: StorageNode[]) {
  storageService.sortNodes(fmNodes)
  storageService.sortNodes(toNodes)

  for (let i = 0; i < toNodes.length; i++) {
    const fmNode = fmNodes[i]
    const toNode = toNodes[i]

    // 移動前と移動後のストアノードを比較検証
    expect(toNode.createdAt).toEqual(fmNode.createdAt)
    expect(toNode.updatedAt.isAfter(fmNode.updatedAt)).toBeTruthy()
    expect(toNode.version).toBe(fmNode.version + 1)

    // 移動前ノードが存在しないことを検証
    const fmNode_fetched = await storageService.getNodeByPath(fmNode.path)
    expect(fmNode_fetched).toBeUndefined()
    if (fmNode.nodeType === StorageNodeType.File) {
      const fileNode = await storageService.getFileNodeByPath(fmNode.path)
      expect(fileNode).toBeUndefined()
    }

    // 移動後ノードが存在することを検証
    // ※移動後ノードが複数存在しないことも検証
    const toNode_fetched = await storeService.storageDao.where('path', '==', toNode.path).fetch()
    if (toNode_fetched.length === 0) {
      throw new Error(`The destination node does not exist: '${toNode.path}'`)
    }
    if (toNode_fetched.length > 1) {
      throw new Error(`There are multiple destination nodes: '${toNode.path}'`)
    }
    if (toNode.nodeType === StorageNodeType.File) {
      const fileDetail = await storageService.getStorageFile(toNode.path)
      expect(fileDetail.exists).toBeTruthy()
      expect(fileDetail.version).toBe(toNode.version)
    }
  }
}

//========================================================================
//
//  Tests
//
//========================================================================

beforeAll(async () => {
  const testingModule = await Test.createTestingModule({
    imports: [DevUtilsServiceModule],
  }).compile()

  devUtilsService = testingModule.get<DevUtilsServiceDI.type>(DevUtilsServiceDI.symbol)
})

describe('StorageService', () => {
  beforeEach(async () => {
    testingModule = await Test.createTestingModule({
      imports: [MockStorageRESTModule],
    }).compile()

    storageService = testingModule.get<TestStorageService>(StorageServiceDI.symbol)
    storeService = testingModule.get<StoreService>(StoreServiceDI.symbol)

    await removeAllNodes()

    // Cloud Storageで短い間隔のノード追加・削除を行うとエラーが発生するので間隔調整している
    await sleep(1500)
  })

  //--------------------------------------------------
  //  Utilities
  //--------------------------------------------------

  describe('getSignedUploadUrls', () => {
    it('ベーシックケース', async () => {
      const requestOrigin = config.cors.whitelist[0]
      const inputs: SignedUploadUrlInput[] = [
        { filePath: `fileA.txt`, contentType: 'text/plain' },
        { filePath: `fileB.txt`, contentType: 'text/plain' },
      ]

      const actual = await storageService.getSignedUploadUrls(requestOrigin, inputs)

      expect(actual.length).toBe(2)
    })
  })

  describe('serveFile', () => {
    let app: any

    beforeAll(async () => {
      await devUtilsService.setTestFirebaseUsers(APP_ADMIN_USER)
    })

    beforeEach(async () => {
      app = testingModule.createNestApplication()
      await app.init()
    })

    it('画像ファイルをダウンロード', async () => {
      const localFilePath = `${__dirname}/${TEST_FILES_DIR}/desert.jpg`
      const toFilePath = `d1/desert.jpg`
      await storageService.uploadLocalFiles([{ localFilePath, toFilePath }])

      return request(app.getHttpServer())
        .get(`/storage/${toFilePath}`)
        .set({ ...APP_ADMIN_USER_HEADER })
        .expect(200)
        .then((res: Response) => {
          const localFileBuffer = fs.readFileSync(localFilePath)
          expect(res.body).toEqual(localFileBuffer)
        })
    })

    it('テキストファイルをダウンロード', async () => {
      const uploadItem: StorageUploadDataItem = {
        data: 'test',
        contentType: 'text/plain; charset=utf-8',
        path: `d1/fileA.txt`,
      }
      await storageService.uploadDataItems([
        {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      return request(app.getHttpServer())
        .get(`/storage/${uploadItem.path}`)
        .set({ ...APP_ADMIN_USER_HEADER })
        .expect(200)
        .then((res: Response) => {
          expect(res.text).toEqual(uploadItem.data)
        })
    })

    it('If-Modified-Sinceの検証', async () => {
      const uploadItem: StorageUploadDataItem = {
        data: 'test',
        contentType: 'text/plain; charset=utf-8',
        path: `d1/fileA.txt`,
      }
      const [fileNodeA] = await storageService.uploadDataItems([uploadItem])

      return request(app.getHttpServer())
        .get(`/storage/${uploadItem.path}`)
        .set({ ...APP_ADMIN_USER_HEADER })
        .set('If-Modified-Since', fileNodeA.updatedAt.toString())
        .expect(304)
    })

    it('存在しないファイルを指定', async () => {
      const uploadItem: StorageUploadDataItem = {
        data: 'test',
        contentType: 'text/plain; charset=utf-8',
        path: `d1/fileA.txt`,
      }

      return request(app.getHttpServer())
        .get(`/storage/${uploadItem.path}`)
        .set({ ...APP_ADMIN_USER_HEADER })
        .expect(404)
    })
  })

  //--------------------------------------------------
  //  App storage
  //--------------------------------------------------

  describe('getNodeById', () => {
    it('ベーシックケース - ディレクトリ', async () => {
      const [, d11] = await storageService.createDirs(['d1/d11'])

      const actual = (await storageService.getNodeById(d11.id))!

      expect(actual.path).toBe(`d1/d11`)
      await existsNodes([actual])
    })

    it('ベーシックケース - ファイル', async () => {
      const [fileNodeA] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      const actual = (await storageService.getNodeById(fileNodeA.id))!

      expect(actual.path).toBe(`d1/fileA.txt`)
      await existsNodes([actual])
    })

    it('空文字を指定した場合', async () => {
      let actual!: Error
      try {
        await storageService.getNodeById(``)
      } catch (err) {
        actual = err
      }
      expect(actual.message).toBe(`'nodeId' is not specified.`)
    })
  })

  describe('getNodeByPath', () => {
    it('ベーシックケース - ディレクトリ', async () => {
      const [, d11] = await storageService.createDirs(['d1/d11'])

      const actual = (await storageService.getNodeByPath(`d1/d11`))!

      expect(actual.path).toBe(`d1/d11`)
      await existsNodes([actual])
    })

    it('ベーシックケース - ファイル', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      const actual = (await storageService.getNodeByPath(`d1/fileA.txt`))!

      expect(actual.path).toBe(`d1/fileA.txt`)
      await existsNodes([actual])
    })

    it('空文字を指定した場合', async () => {
      let actual!: Error
      try {
        await storageService.getNodeByPath(``)
      } catch (err) {
        actual = err
      }
      expect(actual.message).toBe(`'nodePath' is not specified.`)
    })
  })

  describe('getNodesByPaths', () => {
    it('ベーシックケース - ディレクトリ', async () => {
      await storageService.createDirs(['d1/d11'])

      const [d1, d11] = (await storageService.getNodesByPaths([`d1`, `d1/d11`]))!

      expect(d1.path).toBe(`d1`)
      expect(d11.path).toBe(`d1/d11`)
      await existsNodes([d1, d11])
    })

    it('ベーシックケース - ファイル', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileB.txt`,
        },
      ])

      const [fileNodeA, fileNodeB] = (await storageService.getNodesByPaths([`d1/fileA.txt`, `d1/d11/fileB.txt`]))!

      expect(fileNodeA.path).toBe(`d1/fileA.txt`)
      expect(fileNodeB.path).toBe(`d1/d11/fileB.txt`)
      await existsNodes([fileNodeA, fileNodeB])
    })

    it('空文字を指定した場合', async () => {
      let actual!: Error
      try {
        await storageService.getNodesByPaths([``])
      } catch (err) {
        actual = err
      }
      expect(actual.message).toBe(`'nodePath' is not specified.`)
    })
  })

  describe('getDirDescendants', () => {
    it('ベーシックケース', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/d111/fileB.txt`,
        },
        {
          data: 'testC',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d12/fileC.txt`,
        },
      ])

      const actual = await storageService.getDirDescendants(`d1/d11`)

      storageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(4)
      expect(actual.list[0].path).toBe(`d1/d11`)
      expect(actual.list[1].path).toBe(`d1/d11/d111`)
      expect(actual.list[2].path).toBe(`d1/d11/d111/fileB.txt`)
      expect(actual.list[3].path).toBe(`d1/d11/fileA.txt`)
      await existsNodes(actual.list)
    })

    it('検索対象のディレクトリ名に付け加える形のディレクトリが存在する場合', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1-bk/fileA.txt`,
        },
      ])

      // 'd1'を検索した場合、'd1-bk'は含まれないことを検証
      const actual = await storageService.getDirDescendants(`d1`)

      storageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/fileA.txt`)
      await existsNodes(actual.list)
    })

    it('バケット直下の検索', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `fileB.txt`,
        },
      ])

      // バケット直下の検索
      const actual = await storageService.getDirDescendants()

      storageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/fileA.txt`)
      expect(actual.list[2].path).toBe(`fileB.txt`)
      await existsNodes(actual.list)
    })

    it('dirPathにファイルパスを指定した場合', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      // dirPathにファイルパスを指定
      const actual = await storageService.getDirDescendants('d1/fileA.txt')

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(0)
    })

    it('大量データの場合', async () => {
      const uploadItems: StorageUploadDataItem[] = []
      for (let i = 1; i <= 5; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/d111/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      for (let i = 6; i <= 10; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d12/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      uploadItems.push({
        data: `test11`,
        contentType: 'text/plain; charset=utf-8',
        path: `d2/file11.txt`,
      })
      await storageService.uploadDataItems(uploadItems)

      // 大量データを想定して検索を行う
      const actual: StorageNode[] = []
      let fetched = await storageService.getDirDescendants(`d1`, { maxChunk: 3 })
      actual.push(...fetched.list)
      while (fetched.nextPageToken) {
        fetched = await storageService.getDirDescendants(`d1`, { maxChunk: 3, pageToken: fetched.nextPageToken })
        actual.push(...fetched.list)
      }

      storageService.sortNodes(actual)
      expect(actual.length).toBe(14)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/d111`)
      expect(actual[3].path).toBe(`d1/d11/d111/file01.txt`)
      expect(actual[4].path).toBe(`d1/d11/d111/file02.txt`)
      expect(actual[5].path).toBe(`d1/d11/d111/file03.txt`)
      expect(actual[6].path).toBe(`d1/d11/d111/file04.txt`)
      expect(actual[7].path).toBe(`d1/d11/d111/file05.txt`)
      expect(actual[8].path).toBe(`d1/d12`)
      expect(actual[9].path).toBe(`d1/d12/file06.txt`)
      expect(actual[10].path).toBe(`d1/d12/file07.txt`)
      expect(actual[11].path).toBe(`d1/d12/file08.txt`)
      expect(actual[12].path).toBe(`d1/d12/file09.txt`)
      expect(actual[13].path).toBe(`d1/d12/file10.txt`)
      await existsNodes(actual)
    })
  })

  describe('getDescendants', () => {
    it('ベーシックケース', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/d111/fileB.txt`,
        },
        {
          data: 'testC',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d12/fileC.txt`,
        },
      ])

      const actual = await storageService.getDescendants(`d1/d11`)

      storageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d1/d11/d111`)
      expect(actual.list[1].path).toBe(`d1/d11/d111/fileB.txt`)
      expect(actual.list[2].path).toBe(`d1/d11/fileA.txt`)
      await existsNodes(actual.list)
    })

    it('検索対象のディレクトリ名に付け加える形のディレクトリが存在する場合', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1-bk/fileA.txt`,
        },
      ])

      // 'd1'を検索した場合、'd1-bk'は含まれないことを検証
      const actual = await storageService.getDescendants(`d1`)

      storageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(1)
      expect(actual.list[0].path).toBe(`d1/fileA.txt`)
      await existsNodes(actual.list)
    })

    it('バケット直下の検索', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `fileB.txt`,
        },
      ])

      // バケット直下の検索
      const actual = await storageService.getDescendants()

      storageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/fileA.txt`)
      expect(actual.list[2].path).toBe(`fileB.txt`)
      await existsNodes(actual.list)
    })

    it('dirPathにファイルパスを指定した場合', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      // dirPathにファイルパスを指定
      const actual = await storageService.getDescendants('d1/fileA.txt')

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(0)
    })

    it('大量データの場合', async () => {
      const uploadItems: StorageUploadDataItem[] = []
      for (let i = 1; i <= 5; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/d111/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      for (let i = 6; i <= 10; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d12/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      uploadItems.push({
        data: `test11`,
        contentType: 'text/plain; charset=utf-8',
        path: `d2/file11.txt`,
      })
      await storageService.uploadDataItems(uploadItems)

      // 大量データを想定して検索を行う
      const actual: StorageNode[] = []
      let fetched = await storageService.getDescendants(`d1`, { maxChunk: 3 })
      actual.push(...fetched.list)
      while (fetched.nextPageToken) {
        fetched = await storageService.getDescendants(`d1`, { maxChunk: 3, pageToken: fetched.nextPageToken })
        actual.push(...fetched.list)
      }

      storageService.sortNodes(actual)
      expect(actual.length).toBe(13)
      expect(actual[0].path).toBe(`d1/d11`)
      expect(actual[1].path).toBe(`d1/d11/d111`)
      expect(actual[2].path).toBe(`d1/d11/d111/file01.txt`)
      expect(actual[3].path).toBe(`d1/d11/d111/file02.txt`)
      expect(actual[4].path).toBe(`d1/d11/d111/file03.txt`)
      expect(actual[5].path).toBe(`d1/d11/d111/file04.txt`)
      expect(actual[6].path).toBe(`d1/d11/d111/file05.txt`)
      expect(actual[7].path).toBe(`d1/d12`)
      expect(actual[8].path).toBe(`d1/d12/file06.txt`)
      expect(actual[9].path).toBe(`d1/d12/file07.txt`)
      expect(actual[10].path).toBe(`d1/d12/file08.txt`)
      expect(actual[11].path).toBe(`d1/d12/file09.txt`)
      expect(actual[12].path).toBe(`d1/d12/file10.txt`)
      await existsNodes(actual)
    })
  })

  describe('getDirChildren', () => {
    it('ベーシックケース', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileB.txt`,
        },
        {
          data: 'testC',
          contentType: 'text/plain; charset=utf-8',
          path: `d2/fileC.txt`,
        },
      ])

      const actual = await storageService.getDirChildren(`d1`)

      storageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/d11`)
      expect(actual.list[2].path).toBe(`d1/fileA.txt`)
      await existsNodes(actual.list)
    })

    it('検索対象のディレクトリ名に付け加える形のディレクトリが存在する場合', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1-bk/fileA.txt`,
        },
      ])

      // 'd1'を検索した場合、'd1-bk'は含まれないことを検証
      const actual = await storageService.getDirChildren(`d1`)

      storageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/fileA.txt`)
      await existsNodes(actual.list)
    })

    it('バケット直下の検索', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `fileB.txt`,
        },
      ])

      // バケット直下の検索
      const actual = await storageService.getDirChildren()

      storageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`fileB.txt`)
      await existsNodes(actual.list)
    })

    it('dirPathにファイルパスを指定した場合', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      // dirPathにファイルパスを指定
      const actual = await storageService.getDirChildren('d1/fileA.txt')

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(0)
    })

    it('大量データの場合', async () => {
      const uploadItems: StorageUploadDataItem[] = []
      for (let i = 1; i <= 10; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `d1/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      uploadItems.push({
        data: `test11`,
        contentType: 'text/plain; charset=utf-8',
        path: `d1/d11/file11.txt`,
      })
      uploadItems.push({
        data: `test12`,
        contentType: 'text/plain; charset=utf-8',
        path: `d2/file12.txt`,
      })
      await storageService.uploadDataItems(uploadItems)

      // 大量データを想定して検索を行う
      const actual: StorageNode[] = []
      let fetched = await storageService.getDirChildren(`d1`, { maxChunk: 3 })
      actual.push(...fetched.list)
      while (fetched.nextPageToken) {
        fetched = await storageService.getDirChildren(`d1`, { maxChunk: 3, pageToken: fetched.nextPageToken })
        actual.push(...fetched.list)
      }

      storageService.sortNodes(actual)
      expect(actual.length).toBe(12)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/file01.txt`)
      expect(actual[3].path).toBe(`d1/file02.txt`)
      expect(actual[4].path).toBe(`d1/file03.txt`)
      expect(actual[5].path).toBe(`d1/file04.txt`)
      expect(actual[6].path).toBe(`d1/file05.txt`)
      expect(actual[7].path).toBe(`d1/file06.txt`)
      expect(actual[8].path).toBe(`d1/file07.txt`)
      expect(actual[9].path).toBe(`d1/file08.txt`)
      expect(actual[10].path).toBe(`d1/file09.txt`)
      expect(actual[11].path).toBe(`d1/file10.txt`)
      await existsNodes(actual)
    })
  })

  describe('getChildren', () => {
    it('ベーシックケース', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileB.txt`,
        },
        {
          data: 'testC',
          contentType: 'text/plain; charset=utf-8',
          path: `d2/fileC.txt`,
        },
      ])

      const actual = await storageService.getChildren(`d1`)

      storageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d1/d11`)
      expect(actual.list[1].path).toBe(`d1/fileA.txt`)
      await existsNodes(actual.list)
    })

    it('検索対象のディレクトリ名に付け加える形のディレクトリが存在する場合', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1-bk/fileA.txt`,
        },
      ])

      // 'd1'を検索した場合、'd1-bk'は含まれないことを検証
      const actual = await storageService.getChildren(`d1`)

      storageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(1)
      expect(actual.list[0].path).toBe(`d1/fileA.txt`)
      await existsNodes(actual.list)
    })

    it('バケット直下の検索', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `fileB.txt`,
        },
      ])

      // バケット直下の検索
      const actual = await storageService.getChildren()

      storageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`fileB.txt`)
      await existsNodes(actual.list)
    })

    it('dirPathにファイルパスを指定した場合', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      // dirPathにファイルパスを指定
      const actual = await storageService.getChildren('d1/fileA.txt')

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(0)
    })

    it('大量データの場合', async () => {
      const uploadItems: StorageUploadDataItem[] = []
      for (let i = 1; i <= 10; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `d1/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      uploadItems.push({
        data: `test11`,
        contentType: 'text/plain; charset=utf-8',
        path: `d1/d11/file11.txt`,
      })
      uploadItems.push({
        data: `test12`,
        contentType: 'text/plain; charset=utf-8',
        path: `d2/file12.txt`,
      })
      await storageService.uploadDataItems(uploadItems)

      // 大量データを想定して検索を行う
      const actual: StorageNode[] = []
      let fetched = await storageService.getChildren(`d1`, { maxChunk: 3 })
      actual.push(...fetched.list)
      while (fetched.nextPageToken) {
        fetched = await storageService.getChildren(`d1`, { maxChunk: 3, pageToken: fetched.nextPageToken })
        actual.push(...fetched.list)
      }

      storageService.sortNodes(actual)
      expect(actual.length).toBe(11)
      expect(actual[0].path).toBe(`d1/d11`)
      expect(actual[1].path).toBe(`d1/file01.txt`)
      expect(actual[2].path).toBe(`d1/file02.txt`)
      expect(actual[3].path).toBe(`d1/file03.txt`)
      expect(actual[4].path).toBe(`d1/file04.txt`)
      expect(actual[5].path).toBe(`d1/file05.txt`)
      expect(actual[6].path).toBe(`d1/file06.txt`)
      expect(actual[7].path).toBe(`d1/file07.txt`)
      expect(actual[8].path).toBe(`d1/file08.txt`)
      expect(actual[9].path).toBe(`d1/file09.txt`)
      expect(actual[10].path).toBe(`d1/file10.txt`)
      await existsNodes(actual)
    })
  })

  describe('getHierarchicalNodes', () => {
    it('ベーシックケース - 引数にファイルを指定', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/d111/fileA.txt`,
        },
      ])

      const actual = await storageService.getHierarchicalNodes(`d1/d11/d111/fileA.txt`)

      expect(actual.length).toBe(4)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/d111`)
      expect(actual[3].path).toBe(`d1/d11/d111/fileA.txt`)
      await existsNodes(actual)
    })

    it('ベーシックケース - 引数にディレクトリを指定', async () => {
      await storageService.createDirs([`d1/d11/d111`])

      const actual = await storageService.getHierarchicalNodes(`d1/d11/d111`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/d111`)
      await existsNodes(actual)
    })

    it('階層構造の形成に必要なディレクトリが欠けている場合', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/d111/fileA.txt`,
        },
      ])

      // 階層を形成するディレクトリの一部を削除
      const d11 = (await storageService.getNodeByPath(`d1/d11`))!
      await storeService.storageDao.delete(d11.id)

      // 削除されたディレクトリが穴埋めされることを検証
      const actual = await storageService.getHierarchicalNodes(`d1/d11/d111/fileA.txt`)

      expect(actual.length).toBe(4)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/d111`)
      expect(actual[3].path).toBe(`d1/d11/d111/fileA.txt`)
      await existsNodes(actual)
    })

    it('引数ノードが存在しない場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`d1/d11`])

      const actual = await storageService.getHierarchicalNodes(`d1/d11/d111/fileA.txt`)

      // 実際に存在する祖先ノードが取得される
      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      await existsNodes(actual)
    })

    it('空文字を指定した場合', async () => {
      // 空文字を指定
      const actual = await storageService.getHierarchicalNodes(``)

      expect(actual.length).toBe(0)
    })
  })

  describe('getAncestorDirs', () => {
    it('ベーシックケース', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/d111/fileA.txt`,
        },
      ])

      const actual = await storageService.getAncestorDirs(`d1/d11/d111/fileA.txt`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/d111`)
      await existsNodes(actual)
    })

    it('空文字を指定した場合', async () => {
      // 空文字を指定
      const actual = await storageService.getAncestorDirs(``)

      expect(actual.length).toBe(0)
    })
  })

  describe('createDirs', () => {
    it('ベーシックケース', async () => {
      const actual = await storageService.createDirs([`d3`, `d1/d11`, `d1/d12`, `d2/d21`])

      expect(actual.length).toBe(6)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d12`)
      expect(actual[3].path).toBe(`d2`)
      expect(actual[4].path).toBe(`d2/d21`)
      expect(actual[5].path).toBe(`d3`)
      await existsNodes(actual)
    })

    it('既に存在するディレクトリを作成しようとした場合', async () => {
      const [d1_a] = await storageService.createDirs([`d1`])

      const actual = await storageService.createDirs([`d1`])

      expect(actual.length).toBe(0)
      const d1_b = await storageService.getNodeById(d1_a.id)
      expect(d1_a).toEqual(d1_b)
    })

    it('作成ディレクトリパスへのバリデーション実行確認', async () => {
      const validatePath = td.replace(storageService, 'validatePath')

      await storageService.createDirs([`d1`, `d2`])

      const explanation = td.explain(validatePath)
      expect(explanation.calls.length).toBe(2)
      expect(explanation.calls[0].args[0]).toBe(`d1`)
      expect(explanation.calls[1].args[0]).toBe(`d2`)
    })
  })

  describe('removeDir', () => {
    it('ベーシックケース', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileB.txt`,
        },
        {
          data: 'testC',
          contentType: 'text/plain; charset=utf-8',
          path: `d2/fileC.txt`,
        },
      ])

      const actual = await storageService.removeDir(`d1`)

      storageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(4)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/d11`)
      expect(actual.list[2].path).toBe(`d1/d11/fileA.txt`)
      expect(actual.list[3].path).toBe(`d1/fileB.txt`)
      await notExistsNodes(actual.list)
    })

    it('存在しないディレクトリを指定した場合', async () => {
      // 何も行われない(エラーも発生しない)
      const actual = await storageService.removeDir(`d1`)

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(0)
    })

    it('dirPathに空文字を指定した場合', async () => {
      let actual!: Error
      try {
        await storageService.removeDir(``)
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The argument 'dirPath' is empty.`)
    })

    it('大量データの場合', async () => {
      const uploadItems: StorageUploadDataItem[] = []
      for (let i = 1; i <= 5; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/d111/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      for (let i = 6; i <= 10; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d12/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      uploadItems.push({
        data: `test11`,
        contentType: 'text/plain; charset=utf-8',
        path: `file11.txt`,
      })
      await storageService.uploadDataItems(uploadItems)

      // 大量データを想定して分割で削除を行う
      const actual: StorageNode[] = []
      let removed = await storageService.removeDir(`d1`, { maxChunk: 3 })
      actual.push(...removed.list)
      while (removed.nextPageToken) {
        removed = await storageService.removeDir(`d1`, { maxChunk: 3 })
        actual.push(...removed.list)
      }

      storageService.sortNodes(actual)
      expect(actual.length).toBe(14)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/d111`)
      expect(actual[3].path).toBe(`d1/d11/d111/file01.txt`)
      expect(actual[4].path).toBe(`d1/d11/d111/file02.txt`)
      expect(actual[5].path).toBe(`d1/d11/d111/file03.txt`)
      expect(actual[6].path).toBe(`d1/d11/d111/file04.txt`)
      expect(actual[7].path).toBe(`d1/d11/d111/file05.txt`)
      expect(actual[8].path).toBe(`d1/d12`)
      expect(actual[9].path).toBe(`d1/d12/file06.txt`)
      expect(actual[10].path).toBe(`d1/d12/file07.txt`)
      expect(actual[11].path).toBe(`d1/d12/file08.txt`)
      expect(actual[12].path).toBe(`d1/d12/file09.txt`)
      expect(actual[13].path).toBe(`d1/d12/file10.txt`)
      await notExistsNodes(actual)
    })
  })

  describe('removeFile', () => {
    it('ベーシックケース', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      const actual = (await storageService.removeFile(`d1/fileA.txt`))!

      expect(actual.path).toBe(`d1/fileA.txt`)
      await notExistsNodes([actual])
    })

    it('存在しないファイルを指定', async () => {
      const actual = await storageService.removeFile(`d1/fileXXX.txt`)

      expect(actual).toBeUndefined()
    })

    it('filePathに空文字を指定した場合', async () => {
      let actual!: Error
      try {
        await storageService.removeFile(``)
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The argument 'filePath' is empty.`)
    })
  })

  describe('moveDir', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`d2`])

      // 作成したディレクトリにファイルをアップロード
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ])

      // 移動前のノードを取得
      const fmNodes = (await storageService.getDirDescendants(`d1`)).list
      expect(fmNodes.length).toBe(3)

      // 'd1'を'd2/d1'へ移動
      const actual = await storageService.moveDir(`d1`, `d2/d1`)

      // 戻り値の検証
      storageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d2/d1`)
      expect(actual.list[1].path).toBe(`d2/d1/d11`)
      expect(actual.list[2].path).toBe(`d2/d1/d11/fileA.txt`)
      await verifyMoveNodes(fmNodes, actual.list)

      // 移動後の'd2/d1'＋配下ノードを検証
      const movedNodes = (await storageService.getDirDescendants(`d2/d1`)).list
      storageService.sortNodes(movedNodes)
      expect(movedNodes.length).toBe(3)
      expect(movedNodes[0].path).toBe(`d2/d1`)
      expect(movedNodes[1].path).toBe(`d2/d1/d11`)
      expect(movedNodes[2].path).toBe(`d2/d1/d11/fileA.txt`)
    })

    it('バケット直下へ移動する場合', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/docs/fileA.txt`,
        },
      ])

      // 移動前のノードを取得
      const fmNodes = (await storageService.getDirDescendants(`d1/docs`)).list
      expect(fmNodes.length).toBe(2)

      // 'd1/d11'をバケット直下へ移動
      const actual = await storageService.moveDir(`d1/docs`, `docs`)

      // 戻り値の検証
      storageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`docs`)
      expect(actual.list[1].path).toBe(`docs/fileA.txt`)
      await verifyMoveNodes(fmNodes, actual.list)

      // 移動後の'docs'＋配下ノードを検証
      const movedNodes = (await storageService.getDirDescendants(`docs`)).list
      storageService.sortNodes(movedNodes)
      expect(movedNodes.length).toBe(2)
      expect(movedNodes[0].path).toBe(`docs`)
      expect(movedNodes[1].path).toBe(`docs/fileA.txt`)
    })

    it('移動先に同名のディレクトリが存在する場合', async () => {
      // ディレクトリを作成
      // ('d1'と'd2'配下に'docs'を作成)
      await storageService.createDirs([`d1/docs`, `d2/docs`])

      // 作成したディレクトリにファイルをアップロード
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/docs/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `d2/docs/fileB.txt`,
        },
      ])

      // 移動前のノードを取得
      const fmNodes = (await storageService.getDirDescendants(`d1/docs`)).list
      expect(fmNodes.length).toBe(2)

      // 'd1/docs'を'd2/docs'へ移動
      const actual = await storageService.moveDir(`d1/docs`, `d2/docs`)

      // 戻り値の検証
      storageService.sortNodes(actual.list)
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d2/docs`)
      expect(actual.list[1].path).toBe(`d2/docs/fileA.txt`)
      await verifyMoveNodes(fmNodes, actual.list)

      // 移動後の'd2/docs'＋配下ノードを検証
      const movedNodes = (await storageService.getDirDescendants(`d2/docs`)).list
      storageService.sortNodes(movedNodes)
      expect(movedNodes.length).toBe(3)
      expect(movedNodes[0].path).toBe(`d2/docs`)
      expect(movedNodes[1].path).toBe(`d2/docs/fileA.txt`)
      expect(movedNodes[2].path).toBe(`d2/docs/fileB.txt`)
    })

    it('移動先に同名のファイルが存在する場合', async () => {
      // ファイルをアップロード
      // 'd1'と'd2'配下に同じ名前の'file.txt'を配置
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/docs/file.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `d2/docs/file.txt`,
        },
      ])

      // 移動前のノードを取得
      const fmNodes = (await storageService.getDirDescendants(`d1/docs`)).list
      expect(fmNodes.length).toBe(2)
      const existsToNodes = (await storageService.getDirDescendants(`d2/docs`)).list
      expect(existsToNodes.length).toBe(2)

      // 'd1/docs'を'd2/docs'へ移動
      const actual = await storageService.moveDir(`d1/docs`, `d2/docs`)

      // 戻り値の検証
      storageService.sortNodes(actual.list)
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d2/docs`)
      expect(actual.list[1].path).toBe(`d2/docs/file.txt`)
      await verifyMoveNodes(fmNodes, actual.list)

      // 移動後の'd2/docs'＋配下ノードを検証
      const movedNodes = (await storageService.getDirDescendants(`d2/docs`)).list
      storageService.sortNodes(movedNodes)
      expect(movedNodes.length).toBe(2)
      expect(movedNodes[0].path).toBe(`d2/docs`)
      expect(movedNodes[1].path).toBe(`d2/docs/file.txt`)

      // 移動元の'd1/docs/file.txt'の内容が移動先の'd2/docs/file.txt'に上書きされたことを検証
      const { file } = await storageService.getStorageFile(`d2/docs/file.txt`)
      const fileData = await file.download()
      expect(fileData.toString()).toBe('testA')
    })

    it('移動元と移動先が同じ場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`d1`])

      let actual: Error
      try {
        const fmNode = (await storageService.getNodeByPath(`d1`))!
        await storageService.moveDir(fmNode.path, fmNode.path + '/') // 移動先に'/'を付けて試す
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The source and destination are the same: 'd1' -> 'd1'`)
    })

    it('移動先ディレクトリが存在しない場合', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      let actual!: Error
      try {
        await storageService.moveDir(`d1`, `d2/d1`)
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The destination directory does not exist: 'd2'`)
    })

    it('移動先ディレクトリが移動元のサブディレクトリの場合', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ])

      let actual!: Error
      try {
        await storageService.moveDir(`d1`, `d1/d11/d1`)
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The destination directory is its own subdirectory: 'd1' -> 'd1/d11/d1'`)
    })

    it('移動元から移動先に共有設定が引き継がれるか検証 - 移動先に同名のディレクトリはない', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`dY`])

      // 作成したディレクトリにファイルをアップロード
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `dX/dA/dB/fileA.txt`,
        },
      ])

      // 共有設定
      await storageService.setDirShareSettings(`dX/dA`, { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })
      await storageService.setDirShareSettings(`dX/dA/dB`, { isPublic: true, readUIds: ['jiro'], writeUIds: ['jiro'] })
      await storageService.setFileShareSettings(`dX/dA/dB/fileA.txt`, {
        isPublic: true,
        readUIds: ['saburo'],
        writeUIds: ['saburo'],
      })

      // 移動前のノードを取得
      const fmNodes = (await storageService.getDirDescendants(`dX/dA`)).list

      // 'dX/dA'を'dY/dA'へ移動
      const actual = await storageService.moveDir(`dX/dA`, `dY/dA`)

      //
      // 戻り値の検証
      //
      storageService.sortNodes(actual.list)
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`dY/dA`)
      expect(actual.list[1].path).toBe(`dY/dA/dB`)
      expect(actual.list[2].path).toBe(`dY/dA/dB/fileA.txt`)
      await verifyMoveNodes(fmNodes, actual.list)

      // 移動後のノードに共有設定が引き継がれていることを検証
      expect(actual.list[0].share).toEqual<StorageNodeShareSettings>({
        isPublic: true,
        readUIds: ['ichiro'],
        writeUIds: ['ichiro'],
      })
      expect(actual.list[1].share).toEqual<StorageNodeShareSettings>({
        isPublic: true,
        readUIds: ['jiro'],
        writeUIds: ['jiro'],
      })
      expect(actual.list[2].share).toEqual<StorageNodeShareSettings>({
        isPublic: true,
        readUIds: ['saburo'],
        writeUIds: ['saburo'],
      })

      //
      // 移動後の'dY/dA'＋配下ノードを検証
      //
      const movedNodes = (await storageService.getDirDescendants(`dY/dA`)).list
      expect(movedNodes.length).toBe(3)
      expect(movedNodes[0].path).toBe(`dY/dA`)
      expect(movedNodes[1].path).toBe(`dY/dA/dB`)
      expect(movedNodes[2].path).toBe(`dY/dA/dB/fileA.txt`)

      // 移動後のノードに共有設定が引き継がれていることを検証
      expect(movedNodes[0].share).toEqual<StorageNodeShareSettings>({
        isPublic: true,
        readUIds: ['ichiro'],
        writeUIds: ['ichiro'],
      })
      expect(movedNodes[1].share).toEqual<StorageNodeShareSettings>({
        isPublic: true,
        readUIds: ['jiro'],
        writeUIds: ['jiro'],
      })
      expect(movedNodes[2].share).toEqual<StorageNodeShareSettings>({
        isPublic: true,
        readUIds: ['saburo'],
        writeUIds: ['saburo'],
      })
    })

    it('移動元から移動先に共有設定が引き継がれるか検証 - 移動先に同名のディレクトリがある', async () => {
      // ファイルをアップロード
      await storageService.uploadDataItems([
        {
          data: 'testA-X',
          contentType: 'text/plain; charset=utf-8',
          path: `dX/dA/fileA.txt`,
        },
        {
          data: 'testA-Y',
          contentType: 'text/plain; charset=utf-8',
          path: `dY/dA/fileA.txt`,
        },
      ])

      // 共有設定
      // 'dX'配下ノードの設定
      await storageService.setDirShareSettings(`dX/dA`, {
        isPublic: true,
        readUIds: ['ichiro-X'],
        writeUIds: ['ichiro-X'],
      })
      await storageService.setFileShareSettings(`dX/dA/fileA.txt`, {
        isPublic: true,
        readUIds: ['jiro-X'],
        writeUIds: ['jiro-X'],
      })
      // 'dY'配下ノードの設定
      await storageService.setDirShareSettings(`dY/dA`, { isPublic: false, readUIds: ['ichiro-Y'] })
      await storageService.setFileShareSettings(`dY/dA/fileA.txt`, {
        isPublic: false,
        readUIds: ['jiro-Y'],
        writeUIds: ['jiro-Y'],
      })

      // 移動前のノードを取得
      const fmNodes = (await storageService.getDirDescendants(`dX/dA`)).list

      // 'dX/dA'を'dY/dA'へ移動
      const actual = await storageService.moveDir(`dX/dA`, `dY/dA`)

      //
      // 戻り値の検証
      //
      storageService.sortNodes(actual.list)
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`dY/dA`)
      expect(actual.list[1].path).toBe(`dY/dA/fileA.txt`)
      await verifyMoveNodes(fmNodes, actual.list)

      // 移動後のノードに共有設定が引き継がれていることを検証
      expect(actual.list[0].share).toEqual<StorageNodeShareSettings>({
        isPublic: true,
        readUIds: ['ichiro-X'],
        writeUIds: ['ichiro-X'],
      })
      expect(actual.list[1].share).toEqual<StorageNodeShareSettings>({
        isPublic: true,
        readUIds: ['jiro-X'],
        writeUIds: ['jiro-X'],
      })

      //
      // 移動後の'dY/dA'＋配下ノードを検証
      //
      const movedNodes = (await storageService.getDirDescendants(`dY/dA`)).list
      expect(movedNodes.length).toBe(2)
      expect(movedNodes[0].path).toBe(`dY/dA`)
      expect(movedNodes[1].path).toBe(`dY/dA/fileA.txt`)

      // 移動後のノードに共有設定が引き継がれていることを検証
      expect(movedNodes[0].share).toEqual<StorageNodeShareSettings>({
        isPublic: true,
        readUIds: ['ichiro-X'],
        writeUIds: ['ichiro-X'],
      })
      expect(movedNodes[1].share).toEqual<StorageNodeShareSettings>({
        isPublic: true,
        readUIds: ['jiro-X'],
        writeUIds: ['jiro-X'],
      })
    })

    it('移動先ディレクトリパスへのバリデーション実行確認', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      // バリデーションメソッドのモック化
      const validatePath = td.replace(storageService, 'validatePath')

      await storageService.moveDir(`d1`, `d2`)

      const explanation = td.explain(validatePath)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(`d2`)
    })

    it('大量データの場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`dA`])

      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = []
      for (let i = 1; i <= 5; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/d111/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      for (let i = 6; i <= 10; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d12/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      await storageService.uploadDataItems(uploadItems)

      // 移動前のノードを取得
      const fmNodes = (await storageService.getDirDescendants(`d1`)).list

      // 大量データを想定して分割で移動を行う
      // 'd1'を'dA/d1'へ移動
      const actual = await storageService.moveDir(`d1`, `dA/d1`, { maxChunk: 3 })
      while (actual.nextPageToken) {
        const pagination = await storageService.moveDir(`d1`, `dA/d1`, { maxChunk: 3, pageToken: actual.nextPageToken })
        actual.nextPageToken = pagination.nextPageToken
        actual.list.push(...pagination.list)
      }

      // 戻り値の検証
      storageService.sortNodes(actual.list)
      expect(actual.list.length).toBe(14)
      expect(actual.list[0].path).toBe(`dA/d1`)
      expect(actual.list[1].path).toBe(`dA/d1/d11`)
      expect(actual.list[2].path).toBe(`dA/d1/d11/d111`)
      expect(actual.list[3].path).toBe(`dA/d1/d11/d111/file01.txt`)
      expect(actual.list[4].path).toBe(`dA/d1/d11/d111/file02.txt`)
      expect(actual.list[5].path).toBe(`dA/d1/d11/d111/file03.txt`)
      expect(actual.list[6].path).toBe(`dA/d1/d11/d111/file04.txt`)
      expect(actual.list[7].path).toBe(`dA/d1/d11/d111/file05.txt`)
      expect(actual.list[8].path).toBe(`dA/d1/d12`)
      expect(actual.list[9].path).toBe(`dA/d1/d12/file06.txt`)
      expect(actual.list[10].path).toBe(`dA/d1/d12/file07.txt`)
      expect(actual.list[11].path).toBe(`dA/d1/d12/file08.txt`)
      expect(actual.list[12].path).toBe(`dA/d1/d12/file09.txt`)
      expect(actual.list[13].path).toBe(`dA/d1/d12/file10.txt`)
      await verifyMoveNodes(fmNodes, actual.list)

      // 移動後の'dA'＋配下ノードを検証
      const movedNodes = (await storageService.getDirDescendants(`dA`)).list
      storageService.sortNodes(movedNodes)
      expect(movedNodes.length).toBe(15)
      expect(movedNodes[0].path).toBe(`dA`)
      expect(movedNodes[1].path).toBe(`dA/d1`)
      expect(movedNodes[2].path).toBe(`dA/d1/d11`)
      expect(movedNodes[3].path).toBe(`dA/d1/d11/d111`)
      expect(movedNodes[4].path).toBe(`dA/d1/d11/d111/file01.txt`)
      expect(movedNodes[5].path).toBe(`dA/d1/d11/d111/file02.txt`)
      expect(movedNodes[6].path).toBe(`dA/d1/d11/d111/file03.txt`)
      expect(movedNodes[7].path).toBe(`dA/d1/d11/d111/file04.txt`)
      expect(movedNodes[8].path).toBe(`dA/d1/d11/d111/file05.txt`)
      expect(movedNodes[9].path).toBe(`dA/d1/d12`)
      expect(movedNodes[10].path).toBe(`dA/d1/d12/file06.txt`)
      expect(movedNodes[11].path).toBe(`dA/d1/d12/file07.txt`)
      expect(movedNodes[12].path).toBe(`dA/d1/d12/file08.txt`)
      expect(movedNodes[13].path).toBe(`dA/d1/d12/file09.txt`)
      expect(movedNodes[14].path).toBe(`dA/d1/d12/file10.txt`)
    })
  })

  describe('moveFile', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`d2`])

      // ファイルをアップロード
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      // 移動前のノードを取得
      const fmNode = (await storageService.getFileNodeByPath(`d1/fileA.txt`))!

      // 'd1/fileA.txt'を'd2'へ移動
      const actual = await storageService.moveFile(fmNode.path, `d2/fileA.txt`)

      expect(actual.path).toBe(`d2/fileA.txt`)
      await verifyMoveNodes([fmNode], [actual])
    })

    it('バケット直下へ移動する場合', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      // 移動前のノードを取得
      const fmNode = (await storageService.getFileNodeByPath(`d1/fileA.txt`))!

      // 'd1/fileA.txt'をバケット直下へ移動
      const actual = await storageService.moveFile(fmNode.path, `fileA.txt`)

      expect(actual.path).toBe(`fileA.txt`)
      await verifyMoveNodes([fmNode], [actual])
    })

    it('移動先に同名のファイルが存在する場合', async () => {
      // ファイルをアップロード
      // 'd1'と'd2'配下に'file.txt'を配置
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/file.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `d2/file.txt`,
        },
      ])

      // 移動前のノードを取得
      const fmNode = (await storageService.getFileNodeByPath(`d1/file.txt`))!
      const existsToFile = (await storageService.getFileNodeByPath(`d2/file.txt`))!
      expect(existsToFile).toBeDefined()

      // 'd1/file.txt'を'd2'へ移動
      const actual = await storageService.moveFile(fmNode.path, `d2/file.txt`)

      expect(actual.path).toBe(`d2/file.txt`)
      await verifyMoveNodes([fmNode], [actual])

      // 移動元の'd1/file.txt'の内容が移動先の'd2/file.txt'に上書きされたことを検証
      const { file } = await storageService.getStorageFile(`d2/file.txt`)
      const fileData = await file.download()
      expect(fileData.toString()).toBe('testA')
    })

    it('移動元ファイルがない場合', async () => {
      let actual: Error
      try {
        await storageService.moveFile(`d1/fileA.txt`, `d2/fileA.txt`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The source file does not exist: 'd1/fileA.txt'`)
    })

    it('移動先ディレクトリが存在しない場合', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      let actual!: Error
      try {
        const fmNode = (await storageService.getFileNodeByPath(`d1/fileA.txt`))!
        await storageService.moveFile(fmNode.path, `d2/fileA.txt`)
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The destination directory does not exist: 'd2'`)
    })

    it('移動先ファイルパスへのバリデーション実行確認', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`d2`])

      // ファイルをアップロード
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      // バリデーションメソッドのモック化
      const validatePath = td.replace(storageService, 'validatePath')

      await storageService.moveFile(`d1/fileA.txt`, `d2/fileA.txt`)

      const explanation = td.explain(validatePath)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(`d2/fileA.txt`)
    })
  })

  describe('renameDir', () => {
    it('ベーシックケース', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ])

      // リネーム前のノードを取得
      const fmNodes = (await storageService.getDirDescendants(`d1`)).list

      // 'd1'を'd2'へリネーム
      const actual = await storageService.renameDir(`d1`, `d2`)

      // 戻り値の検証
      storageService.sortNodes(actual.list)
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d2`)
      expect(actual.list[1].path).toBe(`d2/d11`)
      expect(actual.list[2].path).toBe(`d2/d11/fileA.txt`)
      await verifyMoveNodes(fmNodes, actual.list)

      // リネーム後の'd2'＋配下ノードを検証
      const renamedNodes = (await storageService.getDirDescendants(`d2`)).list
      storageService.sortNodes(renamedNodes)
      expect(renamedNodes.length).toBe(3)
      expect(renamedNodes[0].path).toBe(`d2`)
      expect(renamedNodes[1].path).toBe(`d2/d11`)
      expect(renamedNodes[2].path).toBe(`d2/d11/fileA.txt`)
    })

    it('リネームしようとする名前のディレクトリが既に存在する場合', async () => {
      await storageService.createDirs([`d1/docs`, `d1/files`])

      let actual: Error
      try {
        // 'd1/docs'を'd1/files'へリネーム
        const dirNode = (await storageService.getNodeByPath(`d1/docs`))!
        await storageService.renameDir(dirNode.path, `files`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The specified directory name already exists: 'd1/docs' -> 'd1/files'`)
    })

    it('ディレクトリパスにディレクトリ名と同じディレクトリがあった場合', async () => {
      // ディレクトリを作成
      // あえて'd1/d1'というディレクトリを作成
      await storageService.createDirs([`d1/d1`])

      // 作成したディレクトリにファイルをアップロード
      await storageService.uploadDataItems([
        // 'd1/d1'というディレクトリにファイルを配置
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d1/fileA.txt`,
        },
      ])

      // リネーム前のノードを取得
      const fmNodes = (await storageService.getDirDescendants(`d1/d1`)).list

      // 'd1/d1'を'd1/d2'へリネーム
      const actual = await storageService.renameDir(`d1/d1`, `d2`)

      // 戻り値の検証
      storageService.sortNodes(actual.list)
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d1/d2`)
      expect(actual.list[1].path).toBe(`d1/d2/fileA.txt`)
      await verifyMoveNodes(fmNodes, actual.list)

      // リネーム後の'd2'＋配下ノードを検証
      const renamedNodes = (await storageService.getDirDescendants(`d1/d2`)).list
      storageService.sortNodes(renamedNodes)
      expect(renamedNodes.length).toBe(2)
      expect(renamedNodes[0].path).toBe(`d1/d2`)
      expect(renamedNodes[1].path).toBe(`d1/d2/fileA.txt`)
    })

    it('既存のディレクトリ名に文字を付け加える形でリネームをした場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`d1`])

      // リネーム前のノードを取得
      const fmNodes = (await storageService.getDirDescendants(`d1`)).list

      // 'd1'を'd1XXX'へリネーム
      const actual = await storageService.renameDir(`d1`, `d1XXX`)

      // 戻り値の検証
      storageService.sortNodes(actual.list)
      expect(actual.list.length).toBe(1)
      expect(actual.list[0].path).toBe(`d1XXX`)
      await verifyMoveNodes(fmNodes, actual.list)

      // リネーム後の'd1'＋配下ノードを検証
      const renamedNodes = (await storageService.getDirDescendants(`d1XXX`)).list
      storageService.sortNodes(renamedNodes)
      expect(renamedNodes.length).toBe(1)
      expect(renamedNodes[0].path).toBe(`d1XXX`)
    })

    it('リネームディレクトリパスへのバリデーション実行確認', async () => {
      // ディレクトリを作成
      await storageService.createDirs([`d1`])

      // バリデーションメソッドのモック化
      const validateDirName = td.replace(storageService, 'validateDirName')

      await storageService.renameDir(`d1`, `d2`)

      const explanation = td.explain(validateDirName)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(`d2`)
    })

    it('大量データの場合', async () => {
      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = []
      for (let i = 1; i <= 5; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `dA/d1/d11/d111/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      for (let i = 6; i <= 10; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `dA/d1/d12/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      await storageService.uploadDataItems(uploadItems)

      // リネーム前のノードを取得
      const fmNodes = (await storageService.getDirDescendants(`dA`)).list

      // 大量データを想定して分割でリネームを行う
      // 'dA'を'dB'へリネーム
      const actual = await storageService.renameDir(`dA`, `dB`, { maxChunk: 3 })
      while (actual.nextPageToken) {
        const nodeData = await storageService.renameDir(`dA`, `dB`, { maxChunk: 3, pageToken: actual.nextPageToken })
        actual.nextPageToken = nodeData.nextPageToken
        actual.list.push(...nodeData.list)
      }

      storageService.sortNodes(actual.list)
      expect(actual.list.length).toBe(15)
      expect(actual.list[0].path).toBe(`dB`)
      expect(actual.list[1].path).toBe(`dB/d1`)
      expect(actual.list[2].path).toBe(`dB/d1/d11`)
      expect(actual.list[3].path).toBe(`dB/d1/d11/d111`)
      expect(actual.list[4].path).toBe(`dB/d1/d11/d111/file01.txt`)
      expect(actual.list[5].path).toBe(`dB/d1/d11/d111/file02.txt`)
      expect(actual.list[6].path).toBe(`dB/d1/d11/d111/file03.txt`)
      expect(actual.list[7].path).toBe(`dB/d1/d11/d111/file04.txt`)
      expect(actual.list[8].path).toBe(`dB/d1/d11/d111/file05.txt`)
      expect(actual.list[9].path).toBe(`dB/d1/d12`)
      expect(actual.list[10].path).toBe(`dB/d1/d12/file06.txt`)
      expect(actual.list[11].path).toBe(`dB/d1/d12/file07.txt`)
      expect(actual.list[12].path).toBe(`dB/d1/d12/file08.txt`)
      expect(actual.list[13].path).toBe(`dB/d1/d12/file09.txt`)
      expect(actual.list[14].path).toBe(`dB/d1/d12/file10.txt`)
      await verifyMoveNodes(fmNodes, actual.list)

      // 移動後の'dB'＋配下ノードを検証
      const renamedNodes = (await storageService.getDirDescendants(`dB`)).list
      storageService.sortNodes(renamedNodes)
      expect(renamedNodes.length).toBe(15)
      expect(renamedNodes[0].path).toBe(`dB`)
      expect(renamedNodes[1].path).toBe(`dB/d1`)
      expect(renamedNodes[2].path).toBe(`dB/d1/d11`)
      expect(renamedNodes[3].path).toBe(`dB/d1/d11/d111`)
      expect(renamedNodes[4].path).toBe(`dB/d1/d11/d111/file01.txt`)
      expect(renamedNodes[5].path).toBe(`dB/d1/d11/d111/file02.txt`)
      expect(renamedNodes[6].path).toBe(`dB/d1/d11/d111/file03.txt`)
      expect(renamedNodes[7].path).toBe(`dB/d1/d11/d111/file04.txt`)
      expect(renamedNodes[8].path).toBe(`dB/d1/d11/d111/file05.txt`)
      expect(renamedNodes[9].path).toBe(`dB/d1/d12`)
      expect(renamedNodes[10].path).toBe(`dB/d1/d12/file06.txt`)
      expect(renamedNodes[11].path).toBe(`dB/d1/d12/file07.txt`)
      expect(renamedNodes[12].path).toBe(`dB/d1/d12/file08.txt`)
      expect(renamedNodes[13].path).toBe(`dB/d1/d12/file09.txt`)
      expect(renamedNodes[14].path).toBe(`dB/d1/d12/file10.txt`)
    })
  })

  describe('renameFile', () => {
    it('ベーシックケース', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      // リネーム前のノードを取得
      const fmNode = (await storageService.getFileNodeByPath(`d1/fileA.txt`))!

      // 'd1/fileA.txt'を'd1/fileB.txt'へリネーム
      const actual = await storageService.renameFile(`d1/fileA.txt`, `fileB.txt`)

      expect(actual.path).toBe(`d1/fileB.txt`)
      await verifyMoveNodes([fmNode], [actual])
    })

    it('リネームしようとする名前のファイルが既に存在する場合', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileB.txt`,
        },
      ])

      let actual: Error
      try {
        // 'd1/fileA.txt'を'd1/fileB.txt'へリネーム
        await storageService.renameFile('d1/fileA.txt', `fileB.txt`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The specified file name already exists: 'd1/fileA.txt' -> 'd1/fileB.txt'`)
    })

    it('ファイルパスにファイル名と同じディレクトリがあった場合', async () => {
      // ディレクトリを作成
      // あえて'd1/fileA.txt'というディレクトリを作成
      await storageService.createDirs([`d1/fileA.txt`])

      // 作成したディレクトリにファイルをアップロード
      await storageService.uploadDataItems([
        // 'd1/fileA.txt'というディレクトリに'fileA.txt'というファイルを配置
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt/fileA.txt`,
        },
      ])

      // リネーム前のノードを取得
      const fmNode = (await storageService.getFileNodeByPath(`d1/fileA.txt/fileA.txt`))!

      // 'd1/fileA.txt/fileA.txt'を'd1/fileA.txt/fileB.txt'へリネーム
      const actual = await storageService.renameFile('d1/fileA.txt/fileA.txt', 'fileB.txt')

      // 'fileA.txt'というディレクトリ名は変わらず、
      // 'fileA.txt'が'fileB.txt'に名前変更されたことを確認
      expect(actual!.path).toBe(`d1/fileA.txt/fileB.txt`)
      await verifyMoveNodes([fmNode], [actual])
    })

    it('リネームディレクトリパスへのバリデーション実行確認', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      // バリデーションメソッドのモック化
      const validateFileName = td.replace(storageService, 'validateFileName')

      await storageService.renameFile(`d1/fileA.txt`, `fileB.txt`)

      const explanation = td.explain(validateFileName)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(`fileB.txt`)
    })
  })

  describe('setDirShareSettings', () => {
    beforeEach(async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])
    })

    it('共有設定 - 設定なしの状態から公開フラグを設定', async () => {
      const actual = await storageService.setDirShareSettings(`d1`, { isPublic: true })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify((await storageService.getNodeById(actual.id))!)
    })

    it('共有設定 - 設定なしの状態から読み込み・書き込み権限を設定', async () => {
      const actual = await storageService.setDirShareSettings(`d1`, { readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({
          isPublic: null,
          readUIds: ['ichiro'],
          writeUIds: ['ichiro'],
        })
      }
      verify(actual)
      verify((await storageService.getNodeById(actual.id))!)
    })

    it('共有設定 - 設定なしの状態から読み込み・書き込み権限を設定', async () => {
      const actual = await storageService.setDirShareSettings(`d1`, { readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({
          isPublic: null,
          readUIds: ['ichiro'],
          writeUIds: ['ichiro'],
        })
      }
      verify(actual)
      verify((await storageService.getNodeById(actual.id))!)
    })

    it('共有設定 - 公開フラグがオンの状態からオフへ設定', async () => {
      // 公開フラグをオンに設定しておく
      await storageService.setDirShareSettings(`d1`, { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      // 公開フラグをオフに設定
      const actual = await storageService.setDirShareSettings(`d1`, { isPublic: false })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({
          isPublic: false,
          readUIds: ['ichiro'],
          writeUIds: ['ichiro'],
        })
      }
      verify(actual)
      verify((await storageService.getNodeById(actual.id))!)
    })

    it('共有設定 - 読み込み・書き込み権限が設定されている状態から空を設定', async () => {
      // 読み込み・書き込み権限を設定しておく
      await storageService.setDirShareSettings(`d1`, { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      // 読み込み・書き込み権限を空に設定
      const actual = await storageService.setDirShareSettings(`d1`, { readUIds: [], writeUIds: [] })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify((await storageService.getNodeById(actual.id))!)
    })

    it('共有設定 - 読み込み・書き込み権限が設定されている状態からnullを設定', async () => {
      // 読み込み・書き込み権限を設定しておく
      await storageService.setDirShareSettings(`d1`, { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      // 読み込み・書き込み権限を空に設定
      const actual = await storageService.setDirShareSettings(`d1`, { readUIds: null, writeUIds: null })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify((await storageService.getNodeById(actual.id))!)
    })

    it('存在しないファイルを指定した場合', async () => {
      let actual!: Error
      try {
        await storageService.setDirShareSettings(`dXXX`, { isPublic: true })
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The specified directory does not exist: 'dXXX'`)
    })

    it('settingsにnullを指定した場合', async () => {
      // 共有設定をしておく
      await storageService.setDirShareSettings(`d1`, { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      // nullを指定
      const actual = await storageService.setDirShareSettings(`d1`, null)

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: null, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify((await storageService.getNodeById(actual.id))!)
    })

    it('作成日時＋更新日時の検証', async () => {
      // 共有設定前のノードを取得
      const fm_d1 = (await storageService.getNodeByPath(`d1`))!

      // 共有設定を実行
      const to_d1 = await storageService.setDirShareSettings(`d1`, { isPublic: true })

      // 作成日時の検証
      expect(to_d1.createdAt).toEqual(fm_d1.createdAt)
      // 更新日時の検証
      expect(to_d1.updatedAt.isAfter(fm_d1.updatedAt)).toBeTruthy()
    })

    it('読み込み権限の設定値に不正なユーザーIDを指定した場合', async () => {
      let actual!: Error
      try {
        // カンマを含んだユーザーIDを設定
        await storageService.setDirShareSettings(`d1`, { readUIds: ['aaa', 'xxx,yyy'] })
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The specified 'readUIds' had an incorrect value: 'xxx,yyy'`)
    })

    it('書き込み権限の設定値に不正なユーザーIDを指定した場合', async () => {
      let actual!: Error
      try {
        // カンマを含んだユーザーIDを設定
        await storageService.setDirShareSettings(`d1`, { writeUIds: ['aaa', 'xxx,yyy'] })
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The specified 'writeUIds' had an incorrect value: 'xxx,yyy'`)
    })
  })

  describe('setFileShareSettings', () => {
    beforeEach(async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])
    })

    it('共有設定 - 設定なしの状態から公開フラグを設定', async () => {
      const actual = await storageService.setFileShareSettings(`d1/fileA.txt`, { isPublic: true })

      const verify = (node: StorageFileNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: null, writeUIds: null })
        const metadata = storageService.extractMetaData(node.file)
        expect(metadata.version).toBe(node.version)
      }
      verify(actual)
      verify((await storageService.getFileNodeById(actual.id))!)
    })

    it('共有設定 - 設定なしの状態から読み込み・書き込み権限を設定', async () => {
      const actual = await storageService.setFileShareSettings(`d1/fileA.txt`, {
        readUIds: ['ichiro'],
        writeUIds: ['ichiro'],
      })

      const verify = (node: StorageFileNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual<StorageNodeShareSettings>({
          isPublic: null,
          readUIds: ['ichiro'],
          writeUIds: ['ichiro'],
        })
        const metadata = storageService.extractMetaData(node.file)
        expect(metadata.version).toBe(node.version)
      }
      verify(actual)
      verify((await storageService.getFileNodeById(actual.id))!)
    })

    it('共有設定 - 公開フラグがオンの状態からオフへ設定', async () => {
      // 公開フラグをオンに設定しておく
      await storageService.setFileShareSettings(`d1/fileA.txt`, {
        isPublic: true,
        readUIds: ['ichiro'],
        writeUIds: ['ichiro'],
      })

      // 公開フラグをオフに設定
      const actual = await storageService.setFileShareSettings(`d1/fileA.txt`, { isPublic: false })

      const verify = (node: StorageFileNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual<StorageNodeShareSettings>({
          isPublic: false,
          readUIds: ['ichiro'],
          writeUIds: ['ichiro'],
        })
        const metadata = storageService.extractMetaData(node.file)
        expect(metadata.version).toBe(node.version)
      }
      verify(actual)
      verify((await storageService.getFileNodeById(actual.id))!)
    })

    it('共有設定 - 読み込み・書き込み権限が設定されている状態から空を設定', async () => {
      // 読み込み・書き込み権限を設定しておく
      await storageService.setFileShareSettings(`d1/fileA.txt`, {
        isPublic: true,
        readUIds: ['ichiro'],
        writeUIds: ['ichiro'],
      })

      // 読み込み・書き込み権限を空に設定
      const actual = await storageService.setFileShareSettings(`d1/fileA.txt`, { readUIds: [], writeUIds: [] })

      const verify = (node: StorageFileNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: null, writeUIds: null })
        const metadata = storageService.extractMetaData(node.file)
        expect(metadata.version).toBe(node.version)
      }
      verify(actual)
      verify((await storageService.getFileNodeById(actual.id))!)
    })

    it('共有設定 - 読み込み・書き込み権限が設定されている状態からnullを設定', async () => {
      // 読み込み・書き込み権限を設定しておく
      await storageService.setFileShareSettings(`d1/fileA.txt`, {
        isPublic: true,
        readUIds: ['ichiro'],
        writeUIds: ['ichiro'],
      })

      // 読み込み・書き込み権限を空に設定
      const actual = await storageService.setFileShareSettings(`d1/fileA.txt`, { readUIds: null, writeUIds: null })

      const verify = (node: StorageFileNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: null, writeUIds: null })
        const metadata = storageService.extractMetaData(node.file)
        expect(metadata.version).toBe(node.version)
      }
      verify(actual)
      verify((await storageService.getFileNodeById(actual.id))!)
    })

    it('存在しないファイルを指定した場合', async () => {
      let actual!: Error
      try {
        await storageService.setFileShareSettings(`d1/zzz.txt`, { isPublic: true })
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The specified file does not exist: 'd1/zzz.txt'`)
    })

    it('settingsにnullを指定した場合', async () => {
      // 共有設定をしておく
      await storageService.setDirShareSettings(`d1`, { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      // nullを指定
      const actual = await storageService.setFileShareSettings(`d1/fileA.txt`, null)

      const verify = (node: StorageFileNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: null, readUIds: null, writeUIds: null })
        const metadata = storageService.extractMetaData(node.file)
        expect(metadata.version).toBe(node.version)
      }
      verify(actual)
      verify((await storageService.getFileNodeById(actual.id))!)
    })

    it('作成日時＋更新日時の検証', async () => {
      // 共有設定前のノードを取得
      const fm_fileA = (await storageService.getFileNodeByPath(`d1/fileA.txt`))!

      // 共有設定を実行
      const to_fileA = await storageService.setFileShareSettings(`d1/fileA.txt`, { isPublic: true })

      // 作成日時の検証
      expect(to_fileA.createdAt).toEqual(fm_fileA.createdAt)
      // 更新日時の検証
      expect(to_fileA.updatedAt.isAfter(fm_fileA.updatedAt)).toBeTruthy()
    })

    it('読み込み権限の設定値に不正なユーザーIDを指定した場合', async () => {
      let actual!: Error
      try {
        await storageService.setFileShareSettings(`d1/fileA.txt`, { readUIds: ['aaa', 'xxx,yyy'] })
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The specified 'readUIds' had an incorrect value: 'xxx,yyy'`)
    })

    it('書き込み権限の設定値に不正なユーザーIDを指定した場合', async () => {
      let actual!: Error
      try {
        await storageService.setFileShareSettings(`d1/fileA.txt`, { writeUIds: ['aaa', 'xxx,yyy'] })
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The specified 'writeUIds' had an incorrect value: 'xxx,yyy'`)
    })
  })

  describe('handleUploadedFile', () => {
    it('ベーシックケース', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ])

      // テストのためストアからノードを削除しておく
      await storeService.storageDao.delete((await storageService.getNodeByPath(`d1`))!.id)
      await storeService.storageDao.delete((await storageService.getNodeByPath(`d1/d11`))!.id)
      await storeService.storageDao.delete((await storageService.getNodeByPath(`d1/d11/fileA.txt`))!.id)

      // ファイルアップロードの後処理を実行
      const actual = (await storageService.handleUploadedFile(`d1/d11/fileA.txt`))!

      // 戻り値の検証
      const { file, ...fileNode } = actual
      await existsNodes([fileNode])

      // 祖先ディレクトリが作成されたことを検証
      const ancestors = await storageService.getAncestorDirs(fileNode.path)
      expect(ancestors[0].path).toBe(`d1`)
      expect(ancestors[1].path).toBe(`d1/d11`)
    })

    it('アップロードによるファイル更新後の実行', async () => {
      const [fileNodeA_1] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
          share: { readUIds: ['ichiro'] },
        },
      ])

      // アップロードによってファイルが更新された状態を作成する
      {
        const bucket = admin.storage().bucket()
        const file = bucket.file(fileNodeA_1.path)
        await file.save('testA-2', { contentType: 'text/plain; charset=utf-8' })
        await storageService.saveMetadata(file, { version: 2 })
      }

      // ファイルアップロードの後処理を実行
      const actual = (await storageService.handleUploadedFile(fileNodeA_1.path))!

      // 戻り値の検証
      const { file, ...fileNodeA_2 } = actual
      expect(fileNodeA_2.share).toEqual(fileNodeA_1.share)
      await existsNodes([fileNodeA_2])
    })

    it('複数回実行した場合', async () => {
      const [fileNodeA] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ])

      // テストのためストアからノードを削除しておく
      await storeService.storageDao.delete((await storageService.getNodeByPath(`d1/d11/fileA.txt`))!.id)

      // ファイルアップロードの後処理を実行 - 1
      await storageService.handleUploadedFile(fileNodeA.path)
      const fileNodeA_1 = (await storageService.getNodeByPath(`d1/d11/fileA.txt`))!
      const fileA_1 = (await storageService.getStorageFile(`d1/d11/fileA.txt`))!

      // ファイルアップロードの後処理を実行 - 2
      await storageService.handleUploadedFile(fileNodeA.path)
      const fileNodeA_2 = (await storageService.getNodeByPath(`d1/d11/fileA.txt`))!
      const fileA_2 = (await storageService.getStorageFile(`d1/d11/fileA.txt`))!

      // 1回目と2回目で内容が同じことを検証
      expect(fileNodeA_1).toEqual(fileNodeA_2)
      expect(fileA_1.version).toEqual(fileA_2.version)
    })

    it('ファイルパスへのバリデーション実行確認', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      const validatePath = td.replace(storageService, 'validatePath')

      await storageService.handleUploadedFile(`d1/fileA.txt`)

      const explanation = td.explain(validatePath)
      expect(explanation.calls.length >= 1).toBeTruthy()
      expect(explanation.calls[0].args[0]).toBe(`d1/fileA.txt`)
    })

    it('存在しないファイルを指定した場合', async () => {
      let actual: Error
      try {
        await storageService.handleUploadedFile(`d1/fileA.txt`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`Uploaded file not found: 'd1/fileA.txt'`)
    })
  })

  describe('serveAppFile', () => {
    let app: any

    beforeAll(async () => {
      await devUtilsService.setTestFirebaseUsers(APP_ADMIN_USER, STORAGE_USER)
    })

    beforeEach(async () => {
      app = testingModule.createNestApplication()
      await app.init()
    })

    it('アプリケーション管理者の場合 - ファイルは公開未設定', async () => {
      const uploadItem: StorageUploadDataItem = {
        data: 'test',
        contentType: 'text/plain; charset=utf-8',
        path: `d1/fileA.txt`,
      }
      await storageService.uploadDataItems([uploadItem])

      return request(app.getHttpServer())
        .get(`/storage/${uploadItem.path}`)
        .set({ ...APP_ADMIN_USER_HEADER })
        .expect(200)
        .then((res: Response) => {
          expect(res.text).toEqual(uploadItem.data)
        })
    })

    it('アプリケーション管理者でない場合 - ファイルは公開未設定 - 上位ディレクトリも公開未設定', async () => {
      const uploadItem: StorageUploadDataItem = {
        data: 'test',
        contentType: 'text/plain; charset=utf-8',
        path: `d1/fileA.txt`,
      }
      await storageService.uploadDataItems([uploadItem])

      return (
        request(app.getHttpServer())
          .get(`/storage/${uploadItem.path}`)
          // アプリケーション管理者以外を設定
          .set({ ...STORAGE_USER_HEADER })
          .expect(403)
      )
    })

    it('アプリケーション管理者でない場合 - ファイルは公開未設定 - 上位ディレクトリに公開設定', async () => {
      const uploadItem: StorageUploadDataItem = {
        data: 'test',
        contentType: 'text/plain; charset=utf-8',
        path: `d1/fileA.txt`,
      }
      await storageService.uploadDataItems([uploadItem])

      // 上位ディレクトリに公開設定
      await storageService.setDirShareSettings(`d1`, { isPublic: true })

      // 上位ディレクトリの公開設定が適用される
      return (
        request(app.getHttpServer())
          .get(`/storage/${uploadItem.path}`)
          // アプリケーション管理者以外を設定
          .set({ ...STORAGE_USER_HEADER })
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(uploadItem.data)
          })
      )
    })

    it('アプリケーション管理者でない場合 - ファイルに公開設定 - 上位ディレクトリは公開未設定', async () => {
      const uploadItem: StorageUploadDataItem = {
        data: 'test',
        contentType: 'text/plain; charset=utf-8',
        path: `d1/fileA.txt`,
      }
      await storageService.uploadDataItems([uploadItem])

      // ファイルに公開設定
      await storageService.setFileShareSettings(uploadItem.path, { isPublic: true })

      // ファイルの公開設定が適用される
      return (
        request(app.getHttpServer())
          .get(`/storage/${uploadItem.path}`)
          // アプリケーション管理者以外を設定
          .set({ ...STORAGE_USER_HEADER })
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(uploadItem.data)
          })
      )
    })

    it('アプリケーション管理者でない場合 - ファイルに公開設定 - 上位ディレクトリに非公開設定', async () => {
      const uploadItem: StorageUploadDataItem = {
        data: 'test',
        contentType: 'text/plain; charset=utf-8',
        path: `d1/fileA.txt`,
      }
      await storageService.uploadDataItems([uploadItem])

      // ファイルに公開設定
      await storageService.setFileShareSettings(uploadItem.path, { isPublic: true })
      // 上位ディレクトリに非公開設定
      await storageService.setDirShareSettings(`d1`, { isPublic: false })

      // ファイルの公開設定が適用される
      return (
        request(app.getHttpServer())
          .get(`/storage/${uploadItem.path}`)
          // アプリケーション管理者以外を設定
          .set({ ...STORAGE_USER_HEADER })
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(uploadItem.data)
          })
      )
    })

    it('アプリケーション管理者でない場合 - ファイルに読み込み権限設定 - 上位ディレクトリは読み込み権限未設定', async () => {
      const uploadItem: StorageUploadDataItem = {
        data: 'test',
        contentType: 'text/plain; charset=utf-8',
        path: `d1/fileA.txt`,
      }
      await storageService.uploadDataItems([uploadItem])

      // ファイルに読み込み権限設定
      await storageService.setFileShareSettings(uploadItem.path, { readUIds: [STORAGE_USER_TOKEN.uid] })

      // ファイルの読み込み権限設定が適用される
      return (
        request(app.getHttpServer())
          .get(`/storage/${uploadItem.path}`)
          // 読み込み権限にマッチするユーザーを設定
          .set({ ...STORAGE_USER_HEADER })
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(uploadItem.data)
          })
      )
    })

    it('アプリケーション管理者でない場合 - ファイルに読み込み権限設定 - 上位ディレクトリに読み込み権限設定', async () => {
      const uploadItem: StorageUploadDataItem = {
        data: 'test',
        contentType: 'text/plain; charset=utf-8',
        path: `d1/fileA.txt`,
      }
      await storageService.uploadDataItems([uploadItem])

      // ファイルに読み込み権限設定
      await storageService.setFileShareSettings(uploadItem.path, { readUIds: [STORAGE_USER_TOKEN.uid] })
      // 上位ディレクトリに読み込み権限設定(ファイルの読み込み権限とは別ユーザーを指定)
      await storageService.setDirShareSettings(`d1`, { readUIds: ['ichiro'] })

      // ファイルの読み込み権限設定が適用される
      return (
        request(app.getHttpServer())
          .get(`/storage/${uploadItem.path}`)
          // 読み込み権限にマッチするユーザーを設定
          .set({ ...STORAGE_USER_HEADER })
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(uploadItem.data)
          })
      )
    })

    it('アプリケーション管理者でない場合 - ファイルは読み込み権限未設定 - 上位ディレクトリに読み込み権限設定', async () => {
      const uploadItem: StorageUploadDataItem = {
        data: 'test',
        contentType: 'text/plain; charset=utf-8',
        path: `d1/fileA.txt`,
      }
      await storageService.uploadDataItems([uploadItem])

      // 上位ディレクトリに読み込み権限設定
      await storageService.setDirShareSettings(`d1`, { readUIds: [STORAGE_USER_TOKEN.uid] })

      // 上位ディレクトリの読み込み権限設定が適用される
      return (
        request(app.getHttpServer())
          .get(`/storage/${uploadItem.path}`)
          // 読み込み権限にマッチするユーザーを設定
          .set({ ...STORAGE_USER_HEADER })
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(uploadItem.data)
          })
      )
    })

    it('アプリケーション管理者でない場合 - ファイルに非公開設定 - 上位ディレクトリに公開設定', async () => {
      const uploadItem: StorageUploadDataItem = {
        data: 'test',
        contentType: 'text/plain; charset=utf-8',
        path: `d1/fileA.txt`,
      }
      await storageService.uploadDataItems([uploadItem])

      // ファイルに非公開設定
      await storageService.setFileShareSettings(uploadItem.path, { isPublic: false })
      // 上位ディレクトリに公開設定
      await storageService.setDirShareSettings(`d1`, { isPublic: true })

      // ファイルの非公開設定が適用される
      return request(app.getHttpServer()).get(`/storage/${uploadItem.path}`).expect(401)
    })

    it('ログインしていない場合 - ファイルが公開されている', async () => {
      const uploadItem: StorageUploadDataItem = {
        data: 'test',
        contentType: 'text/plain; charset=utf-8',
        path: `d1/fileA.txt`,
      }
      await storageService.uploadDataItems([uploadItem])

      // ファイルを公開に設定
      await storageService.setFileShareSettings(uploadItem.path, { isPublic: true })

      // Authorizationヘッダーを設定しない
      return request(app.getHttpServer())
        .get(`/storage/${uploadItem.path}`)
        .expect(200)
        .then((res: Response) => {
          expect(res.text).toEqual(uploadItem.data)
        })
    })

    it('ログインしていない場合 - ファイルが公開されていない', async () => {
      // ファイルのアップロード
      const uploadItem: StorageUploadDataItem = {
        data: 'test',
        contentType: 'text/plain; charset=utf-8',
        path: `d1/fileA.txt`,
      }
      await storageService.uploadDataItems([uploadItem])

      // Authorizationヘッダーを設定しない
      return request(app.getHttpServer()).get(`/storage/${uploadItem.path}`).expect(401)
    })
  })

  //--------------------------------------------------
  //  User storage
  //--------------------------------------------------

  describe('getUserNodeById', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const [fileNodA] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        },
      ])

      const actual = (await storageService.getUserNodeById(STORAGE_USER_TOKEN, fileNodA.id))!

      expect(actual.path).toBe(`d1/fileA.txt`)
    })
  })

  describe('getUserNodeByPath', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        },
      ])

      const actual = (await storageService.getUserNodeByPath(STORAGE_USER_TOKEN, `d1/fileA.txt`))!

      expect(actual.path).toBe(`d1/fileA.txt`)
    })
  })

  describe('getUserNodesByPaths', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/d11/fileB.txt`,
        },
      ])

      const [fileA, fileB] = (await storageService.getUserNodesByPaths(STORAGE_USER_TOKEN, [`d1/fileA.txt`, `d1/d11/fileB.txt`]))!

      expect(fileA.path).toBe(`d1/fileA.txt`)
      expect(fileB.path).toBe(`d1/d11/fileB.txt`)
    })
  })

  describe('getUserDirDescendants', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/d11/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/d11/d111/fileB.txt`,
        },
        {
          data: 'testC',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/d12/fileC.txt`,
        },
      ])

      const actual = await storageService.getUserDirDescendants(STORAGE_USER_TOKEN, `d1/d11`)

      storageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(4)
      expect(actual.list[0].path).toBe(`d1/d11`)
      expect(actual.list[1].path).toBe(`d1/d11/d111`)
      expect(actual.list[2].path).toBe(`d1/d11/d111/fileB.txt`)
      expect(actual.list[3].path).toBe(`d1/d11/fileA.txt`)
    })

    it(`ユーザーディレクトリ直下の検索`, async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/fileB.txt`,
        },
      ])

      const actual = await storageService.getUserDirDescendants(STORAGE_USER_TOKEN)

      storageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/fileA.txt`)
      expect(actual.list[2].path).toBe(`fileB.txt`)
    })
  })

  describe('getUserDescendants', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/d11/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/d11/d111/fileB.txt`,
        },
        {
          data: 'testC',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/d12/fileC.txt`,
        },
      ])

      const actual = await storageService.getUserDescendants(STORAGE_USER_TOKEN, `d1/d11`)

      storageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d1/d11/d111`)
      expect(actual.list[1].path).toBe(`d1/d11/d111/fileB.txt`)
      expect(actual.list[2].path).toBe(`d1/d11/fileA.txt`)
    })

    it(`ユーザーディレクトリ直下の検索`, async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/fileB.txt`,
        },
      ])

      const actual = await storageService.getUserDescendants(STORAGE_USER_TOKEN)

      storageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/fileA.txt`)
      expect(actual.list[2].path).toBe(`fileB.txt`)
    })
  })

  describe('getUserDirChildren', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/d11/fileB.txt`,
        },
        {
          data: 'testC',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d2/fileC.txt`,
        },
      ])

      const actual = await storageService.getUserDirChildren(STORAGE_USER_TOKEN, `d1`)

      storageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/d11`)
      expect(actual.list[2].path).toBe(`d1/fileA.txt`)
    })

    it(`ユーザーディレクトリ直下の検索`, async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/fileB.txt`,
        },
      ])

      const actual = await storageService.getUserDirChildren(STORAGE_USER_TOKEN)

      storageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`fileB.txt`)
    })
  })

  describe('getUserChildren', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/d11/fileB.txt`,
        },
        {
          data: 'testC',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d2/fileC.txt`,
        },
      ])

      const actual = await storageService.getUserChildren(STORAGE_USER_TOKEN, `d1`)

      storageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d1/d11`)
      expect(actual.list[1].path).toBe(`d1/fileA.txt`)
    })

    it(`ユーザーディレクトリ直下の検索`, async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/fileB.txt`,
        },
      ])

      const actual = await storageService.getUserChildren(STORAGE_USER_TOKEN)

      storageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`fileB.txt`)
    })
  })

  describe('getUserHierarchicalNodes', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/d11/d111/fileA.txt`,
        },
      ])

      const actual = await storageService.getUserHierarchicalNodes(STORAGE_USER_TOKEN, `d1/d11/d111/fileA.txt`)

      expect(actual.length).toBe(4)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/d111`)
      expect(actual[3].path).toBe(`d1/d11/d111/fileA.txt`)
    })
  })

  describe('getUserAncestorDirs', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/d11/d111/fileA.txt`,
        },
      ])

      const actual = await storageService.getUserAncestorDirs(STORAGE_USER_TOKEN, `d1/d11/d111/fileA.txt`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/d111`)
    })
  })

  describe('createUserDirs', () => {
    it('ベーシックケース', async () => {
      const actual = await storageService.createUserDirs(STORAGE_USER_TOKEN, [`d3`, `d1/d11`, `d1/d12`, `d2/d21`])

      expect(actual.length).toBe(6)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d12`)
      expect(actual[3].path).toBe(`d2`)
      expect(actual[4].path).toBe(`d2/d21`)
      expect(actual[5].path).toBe(`d3`)
    })
  })

  describe('removeUserDir', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/d11/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileB.txt`,
        },
        {
          data: 'testC',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d2/fileC.txt`,
        },
      ])

      const actual = await storageService.removeUserDir(STORAGE_USER_TOKEN, `d1`)

      storageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(4)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/d11`)
      expect(actual.list[2].path).toBe(`d1/d11/fileA.txt`)
      expect(actual.list[3].path).toBe(`d1/fileB.txt`)
    })
  })

  describe('removeUserFile', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        },
      ])

      const actual = (await storageService.removeUserFile(STORAGE_USER_TOKEN, `d1/fileA.txt`))!

      expect(actual.path).toBe(`d1/fileA.txt`)
    })
  })

  describe('moveUserDir', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)

      // ディレクトリを作成
      await storageService.createDirs([`${userDirPath}/d2`])

      // 作成したディレクトリにファイルをアップロード
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/d11/fileA.txt`,
        },
      ])

      // 'd1'を'd2/d1'へ移動
      const actual = await storageService.moveUserDir(STORAGE_USER_TOKEN, `d1`, `d2/d1`)

      // 戻り値の検証
      storageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d2/d1`)
      expect(actual.list[1].path).toBe(`d2/d1/d11`)
      expect(actual.list[2].path).toBe(`d2/d1/d11/fileA.txt`)

      // 移動後の'd2/d1'＋配下ノードを検証
      const movedNodes = (await storageService.getUserDirDescendants(STORAGE_USER_TOKEN, `d2/d1`)).list
      storageService.sortNodes(movedNodes)
      expect(movedNodes.length).toBe(3)
      expect(movedNodes[0].path).toBe(`d2/d1`)
      expect(movedNodes[1].path).toBe(`d2/d1/d11`)
      expect(movedNodes[2].path).toBe(`d2/d1/d11/fileA.txt`)
    })
  })

  describe('moveUserFile', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)

      // ディレクトリを作成
      await storageService.createDirs([`${userDirPath}/d2`])

      // ファイルをアップロード
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        },
      ])

      // 'd1/fileA.txt'を'd2'へ移動
      const actual = await storageService.moveUserFile(STORAGE_USER_TOKEN, `d1/fileA.txt`, `d2/fileA.txt`)

      expect(actual.path).toBe(`d2/fileA.txt`)
    })
  })

  describe('renameUserDir', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)

      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/d11/fileA.txt`,
        },
      ])

      // 'd1'を'd2'へリネーム
      const actual = await storageService.renameUserDir(STORAGE_USER_TOKEN, `d1`, `d2`)

      // 戻り値の検証
      storageService.sortNodes(actual.list)
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d2`)
      expect(actual.list[1].path).toBe(`d2/d11`)
      expect(actual.list[2].path).toBe(`d2/d11/fileA.txt`)

      // リネーム後の'd2'＋配下ノードを検証
      const renamedNodes = (await storageService.getUserDirDescendants(STORAGE_USER_TOKEN, `d2`)).list
      storageService.sortNodes(renamedNodes)
      expect(renamedNodes.length).toBe(3)
      expect(renamedNodes[0].path).toBe(`d2`)
      expect(renamedNodes[1].path).toBe(`d2/d11`)
      expect(renamedNodes[2].path).toBe(`d2/d11/fileA.txt`)
    })
  })

  describe('renameUserFile', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        },
      ])

      // 'd1/fileA.txt'を'd1/fileB.txt'へリネーム
      const actual = await storageService.renameUserFile(STORAGE_USER_TOKEN, `d1/fileA.txt`, `fileB.txt`)

      expect(actual.path).toBe(`d1/fileB.txt`)
    })
  })

  describe('setUserDirShareSettings', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        },
      ])

      const actual = await storageService.setUserDirShareSettings(STORAGE_USER_TOKEN, `d1`, { isPublic: true })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify((await storageService.getUserNodeById(STORAGE_USER_TOKEN, actual.id))!)
    })
  })

  describe('setUserFileShareSettings', () => {
    it('共有設定 - 設定なしの状態から公開フラグを設定', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        },
      ])

      const actual = await storageService.setUserFileShareSettings(STORAGE_USER_TOKEN, `d1/fileA.txt`, { isPublic: true })

      const verify = (node: StorageFileNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: null, writeUIds: null })
        const metadata = storageService.extractMetaData(node.file)
        expect(metadata.version).toBe(node.version)
      }
      verify(actual)
      verify((await storageService.getUserFileNodeById(STORAGE_USER_TOKEN, actual.id))!)
    })
  })

  describe('handleUserUploadedFile', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadDataItems(uploadItems)

      // テストのためストアからノードを削除しておく
      await storeService.storageDao.delete((await storageService.getNodeByPath(`${userDirPath}/d1`))!.id)
      await storeService.storageDao.delete((await storageService.getNodeByPath(`${userDirPath}/d1/d11`))!.id)
      await storeService.storageDao.delete((await storageService.getNodeByPath(`${userDirPath}/d1/d11/fileA.txt`))!.id)

      // ファイルアップロードの後処理を実行
      const actual = (await storageService.handleUploadedUserFile(STORAGE_USER_TOKEN, `d1/d11/fileA.txt`))!

      // 戻り値の検証
      const { file, ...fileNode } = actual
      expect(fileNode.path).toBe(`d1/d11/fileA.txt`)

      // 祖先ディレクトリが作成されたことを検証
      const ancestors = await storageService.getUserAncestorDirs(STORAGE_USER_TOKEN, fileNode.path)
      expect(ancestors[0].path).toBe(`d1`)
      expect(ancestors[1].path).toBe(`d1/d11`)
    })
  })

  describe('serveUserFile', () => {
    let app: any

    beforeAll(async () => {
      await devUtilsService.setTestFirebaseUsers(APP_ADMIN_USER, STORAGE_USER)
    })

    beforeEach(async () => {
      app = testingModule.createNestApplication()
      await app.init()
    })

    it('自ユーザーの場合 - ファイルは公開未設定', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const uploadItem: StorageUploadDataItem = {
        data: 'test',
        contentType: 'text/plain; charset=utf-8',
        path: `${userDirPath}/d1/fileA.txt`,
      }
      await storageService.uploadDataItems([uploadItem])

      return request(app.getHttpServer())
        .get(`/storage/${uploadItem.path}`)
        .set({ ...STORAGE_USER_HEADER })
        .expect(200)
        .then((res: Response) => {
          expect(res.text).toEqual(uploadItem.data)
        })
    })

    it('他ユーザーの場合 - ファイルは公開未設定 - 上位ディレクトリも公開未設定', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const uploadItem: StorageUploadDataItem = {
        data: 'test',
        contentType: 'text/plain; charset=utf-8',
        path: `${userDirPath}/d1/fileA.txt`,
      }
      await storageService.uploadDataItems([uploadItem])

      return request(app.getHttpServer())
        .get(`/storage/${uploadItem.path}`)
        .set({ ...APP_ADMIN_USER_HEADER })
        .expect(403)
    })

    it('他ユーザーの場合 - ファイルは公開未設定 - 上位ディレクトリに公開設定', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const uploadItem: StorageUploadDataItem = {
        data: 'test',
        contentType: 'text/plain; charset=utf-8',
        path: `${userDirPath}/d1/fileA.txt`,
      }
      await storageService.uploadDataItems([uploadItem])

      // 上位ディレクトリに公開設定
      await storageService.setDirShareSettings(`${userDirPath}/d1`, { isPublic: true })

      // 上位ディレクトリの公開設定が適用される
      return request(app.getHttpServer())
        .get(`/storage/${uploadItem.path}`)
        .set({ ...STORAGE_USER_HEADER })
        .expect(200)
        .then((res: Response) => {
          expect(res.text).toEqual(uploadItem.data)
        })
    })

    it('他ユーザーの場合 - ファイルに公開設定 - 上位ディレクトリは公開未設定', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const uploadItem: StorageUploadDataItem = {
        data: 'test',
        contentType: 'text/plain; charset=utf-8',
        path: `${userDirPath}/d1/fileA.txt`,
      }
      await storageService.uploadDataItems([uploadItem])

      // ファイルに公開設定
      await storageService.setFileShareSettings(uploadItem.path, { isPublic: true })

      // ファイルの公開設定が適用される
      return request(app.getHttpServer())
        .get(`/storage/${uploadItem.path}`)
        .set({ ...APP_ADMIN_USER_HEADER })
        .expect(200)
        .then((res: Response) => {
          expect(res.text).toEqual(uploadItem.data)
        })
    })

    it('他ユーザーの場合 - ファイルに公開設定 - 上位ディレクトリに非公開設定', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const uploadItem: StorageUploadDataItem = {
        data: 'test',
        contentType: 'text/plain; charset=utf-8',
        path: `${userDirPath}/d1/fileA.txt`,
      }
      await storageService.uploadDataItems([uploadItem])

      // ファイルに公開設定
      await storageService.setFileShareSettings(uploadItem.path, { isPublic: true })
      // 上位ディレクトリに非公開設定
      await storageService.setDirShareSettings(`${userDirPath}/d1`, { isPublic: false })

      // ファイルの公開設定が適用される
      return request(app.getHttpServer())
        .get(`/storage/${uploadItem.path}`)
        .set({ ...APP_ADMIN_USER_HEADER })
        .expect(200)
        .then((res: Response) => {
          expect(res.text).toEqual(uploadItem.data)
        })
    })

    it('他ユーザーの場合 - ファイルに読み込み権限設定 - 上位ディレクトリは読み込み権限未設定', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const uploadItem: StorageUploadDataItem = {
        data: 'test',
        contentType: 'text/plain; charset=utf-8',
        path: `${userDirPath}/d1/fileA.txt`,
      }
      await storageService.uploadDataItems([uploadItem])

      // ファイルに読み込み権限設定
      await storageService.setFileShareSettings(uploadItem.path, { readUIds: [APP_ADMIN_USER.uid] })

      // ファイルの読み込み権限設定が適用される
      return (
        request(app.getHttpServer())
          .get(`/storage/${uploadItem.path}`)
          // 読み込み権限にマッチするユーザーを設定
          .set({ ...APP_ADMIN_USER_HEADER })
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(uploadItem.data)
          })
      )
    })

    it('他ユーザーの場合 - ファイルに読み込み権限設定 - 上位ディレクトリに読み込み権限設定', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      // ディレクトリの作成
      await storageService.createDirs([`${userDirPath}/d1`])
      // ファイルのアップロード
      const uploadItem: StorageUploadDataItem = {
        data: 'test',
        contentType: 'text/plain; charset=utf-8',
        path: `${userDirPath}/d1/fileA.txt`,
      }
      await storageService.uploadDataItems([uploadItem])

      // ファイルに読み込み権限設定
      await storageService.setFileShareSettings(uploadItem.path, { readUIds: [APP_ADMIN_USER.uid] })
      // 上位ディレクトリに読み込み権限設定
      await storageService.setDirShareSettings(`${userDirPath}/d1`, { readUIds: ['ichiro'] })

      // ファイルの読み込み権限設定が適用される
      return (
        request(app.getHttpServer())
          .get(`/storage/${uploadItem.path}`)
          // 読み込み権限にマッチするユーザーを設定
          .set({ ...APP_ADMIN_USER_HEADER })
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(uploadItem.data)
          })
      )
    })

    it('他ユーザーの場合 - ファイルは読み込み権限未設定 - 上位ディレクトリに読み込み権限設定', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const uploadItem: StorageUploadDataItem = {
        data: 'test',
        contentType: 'text/plain; charset=utf-8',
        path: `${userDirPath}/d1/fileA.txt`,
      }
      await storageService.uploadDataItems([uploadItem])

      // 上位ディレクトリに読み込み権限設定
      await storageService.setDirShareSettings(`${userDirPath}/d1`, { readUIds: [APP_ADMIN_USER.uid] })

      // 上位ディレクトリの読み込み権限設定が適用される
      return (
        request(app.getHttpServer())
          .get(`/storage/${uploadItem.path}`)
          // 読み込み権限にマッチするユーザーを設定
          .set({ ...APP_ADMIN_USER_HEADER })
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(uploadItem.data)
          })
      )
    })

    it('ログインしていない場合 - ファイルが公開されている', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const uploadItem: StorageUploadDataItem = {
        data: 'test',
        contentType: 'text/plain; charset=utf-8',
        path: `${userDirPath}/d1/fileA.txt`,
      }
      await storageService.uploadDataItems([uploadItem])

      // ファイルを公開に設定
      await storageService.setFileShareSettings(uploadItem.path, { isPublic: true })

      // Authorizationヘッダーを設定しない
      return request(app.getHttpServer())
        .get(`/storage/${uploadItem.path}`)
        .expect(200)
        .then((res: Response) => {
          expect(res.text).toEqual(uploadItem.data)
        })
    })

    it('ログインしていない場合 - ファイルが公開されていない', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const uploadItem: StorageUploadDataItem = {
        data: 'test',
        contentType: 'text/plain; charset=utf-8',
        path: `${userDirPath}/d1/fileA.txt`,
      }
      await storageService.uploadDataItems([uploadItem])

      // Authorizationヘッダーを設定しない
      return request(app.getHttpServer()).get(`/storage/${uploadItem.path}`).expect(401)
    })
  })

  describe('deleteUserDir', () => {
    it('ベーシックケース', async () => {
      const user1Dir = storageService.getUserDirPath({ uid: 'user1' })
      const user2Dir = storageService.getUserDirPath({ uid: 'user2' })
      const user3Dir = storageService.getUserDirPath({ uid: 'user3' })
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${user1Dir}/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${user2Dir}/d1/fileB.txt`,
        },
        {
          data: 'testC',
          contentType: 'text/plain; charset=utf-8',
          path: `${user2Dir}/fileC.txt`,
        },
        {
          data: 'testD',
          contentType: 'text/plain; charset=utf-8',
          path: `${user3Dir}/fileD.txt`,
        },
      ])
      const user2Nodes = (await storageService.getDirDescendants(user2Dir)).list
      const otherNodes = [...(await storageService.getDirDescendants(user1Dir)).list, ...(await storageService.getDirDescendants(user3Dir)).list]

      // ユーザーディレクトリを削除
      await storageService.deleteUserDir('user2')

      await notExistsNodes(user2Nodes)
      await existsNodes(otherNodes)
    })

    it('大量データの場合', async () => {
      const user1Dir = storageService.getUserDirPath({ uid: 'user1' })
      const uploadItems: StorageUploadDataItem[] = []
      for (let i = 1; i <= 5; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `${user1Dir}/d1/d11/d111/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      for (let i = 6; i <= 10; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `${user1Dir}/d1/d12/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      await storageService.uploadDataItems(uploadItems)
      const user1Nodes = (await storageService.getDirDescendants(user1Dir)).list

      // ユーザーディレクトリを削除
      await storageService.deleteUserDir('user1', 3)

      await notExistsNodes(user1Nodes)
    })
  })
})
