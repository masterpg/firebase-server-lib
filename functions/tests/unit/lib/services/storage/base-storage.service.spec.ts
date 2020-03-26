import * as admin from 'firebase-admin'
import * as fs from 'fs'
import * as path from 'path'
import * as shortid from 'shortid'
import * as td from 'testdouble'
import {
  GCSStorageNode,
  InputValidationError,
  LibDevUtilsServiceDI,
  LibStorageService,
  LibStorageServiceDI,
  SignedUploadUrlInput,
  StorageNode,
  StorageNodeShareSettings,
  StorageNodeType,
  UploadDataItem,
} from '../../../../../src/lib'
import { Test, TestingModule } from '@nestjs/testing'
import { MockBaseAppModule } from '../../../../mocks/lib'
import { Module } from '@nestjs/common'
import { Response } from 'supertest'
import { config } from '../../../../../src/config'
import { initLibTestApp } from '../../../../helpers/lib'
import { removeBothEndsSlash } from 'web-base-lib'
const dayjs = require('dayjs')
const request = require('supertest')

jest.setTimeout(25000)
initLibTestApp()

//========================================================================
//
//  Test data
//
//========================================================================

const TEST_FILES_DIR = 'test-files'

const EMPTY_SHARE_SETTINGS: StorageNodeShareSettings = {
  isPublic: undefined,
  uids: undefined,
}

//========================================================================
//
//  Test helpers
//
//========================================================================

let testingModule!: TestingModule

let storageService!: TestStorageService

let devUtilsService!: LibDevUtilsServiceDI.type

type TestStorageService = LibStorageService & {
  saveDirNode: LibStorageService['saveDirNode']
  saveFileNode: LibStorageService['saveFileNode']
  getDirDescendantDict: LibStorageService['getDirDescendantDict']
  getDescendantDict: LibStorageService['getDescendantDict']
  getDirChildDict: LibStorageService['getDirChildDict']
  getChildDict: LibStorageService['getChildDict']
  toStorageNode: LibStorageService['toStorageNode']
  sortStorageNodes: LibStorageService['sortStorageNodes']
  padVirtualDirNodes: LibStorageService['padVirtualDirNodes']
  padRealDirNodes: LibStorageService['padRealDirNodes']
  getHierarchicalNodeDict: LibStorageService['getHierarchicalNodeDict']
  validatePath: LibStorageService['validatePath']
  validateDirName: LibStorageService['validateDirName']
  validateFileName: LibStorageService['validateFileName']
  saveMetadata: LibStorageService['saveMetadata']
}

@Module({
  imports: [MockBaseAppModule],
})
class MockAppModule {}

/**
 * 指定された`StorageNode`自体の検証と、対象のノードがCloud Storageに存在することを検証します。
 * @param basePath
 * @param nodes
 */
async function existsNodes(basePath: string | null, nodes: StorageNode[]): Promise<void> {
  const bucket = admin.storage().bucket()
  for (const node of nodes) {
    // idが設定されていることを検証
    expect(shortid.isValid(node.id)).toBeTruthy()
    // ディレクトリの末尾が'/'でないことを検証
    expect(node.dir.endsWith('/')).toBeFalsy()
    // node.path が ｢node.dir + node.name｣ と一致することを検証
    expect(node.path).toBe(path.join(node.dir, node.name))
    // Cloud Storageに対象のノードが存在することを検証
    let nodePath = basePath ? `${removeBothEndsSlash(basePath)}/${node.path}` : node.path
    nodePath += node.nodeType === StorageNodeType.Dir ? '/' : ''
    const gcsNode = bucket.file(nodePath)
    const [exists] = await gcsNode.exists()
    expect(exists).toBeTruthy()
  }
}

/**
 * 指定された`StorageNode`自体の検証と、対象のノードがCloud Storageに存在しないことを検証します。
 * @param basePath
 * @param nodes
 */
async function notExistsNodes(basePath: string | null, nodes: StorageNode[]): Promise<void> {
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
    const [exists] = await gcsNode.exists()
    expect(exists).toBeFalsy()
  }
}

/**
 * テスト結果として取得されたノードを再度取得し直します。
 * @param basePath
 * @param nodes
 */
async function getNodesByActualNodes(basePath: string | null, nodes: StorageNode[]): Promise<StorageNode[]> {
  const promises: Promise<StorageNode>[] = []
  for (const node of nodes) {
    switch (node.nodeType) {
      case StorageNodeType.Dir:
        promises.push(storageService.getRealDirNode(basePath, node.path))
        break
      case StorageNodeType.File:
        promises.push(storageService.getRealFileNode(basePath, node.path))
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

describe('BaseStorageService', () => {
  beforeEach(async () => {
    testingModule = await Test.createTestingModule({
      imports: [MockAppModule],
    }).compile()

    storageService = testingModule.get<TestStorageService>(LibStorageServiceDI.symbol)
    devUtilsService = testingModule.get<LibDevUtilsServiceDI.type>(LibDevUtilsServiceDI.symbol)

    await storageService.removeDirs(null, [`${TEST_FILES_DIR}`])

    // Cloud Storageで短い間隔のノード追加・削除を行うとエラーが発生するので間隔調整している
    await sleep(2500)
  })

  describe('getNode', () => {
    it('ベーシックケース - ディレクトリ', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`])

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
          path: `${TEST_FILES_DIR}/d1/d11/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = (await storageService.getNode(null, `${TEST_FILES_DIR}/d1/d11`))!

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      await existsNodes(null, [actual])
    })

    it('ベーシックケース - ファイル', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`])

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
          path: `${TEST_FILES_DIR}/d1/d11/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = (await storageService.getNode(null, `${TEST_FILES_DIR}/d1/d11/fileB.txt`))!

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1/d11/fileB.txt`)
      await existsNodes(null, [actual])
    })

    it('対象ディレクトリの子ノードは存在するが、実際のディレクトリは存在しない場合', async () => {
      // ディレクトリを作成せずにファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = (await storageService.getNode(null, `${TEST_FILES_DIR}/d1/d11`))!

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      await existsNodes(null, [actual])
    })

    it('対象ディレクトリが存在しない場合 - 親ディレクトリは存在する', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      const actual = await storageService.getNode(null, `${TEST_FILES_DIR}/d1/d11`)

      expect(actual).toBeUndefined()
    })

    it('対象ディレクトリが存在しない場合 - 親ディレクトリも存在しない', async () => {
      const actual = await storageService.getNode(null, `${TEST_FILES_DIR}/d1/d11`)

      expect(actual).toBeUndefined()
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
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
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const actual = (await storageService.getNode(`${TEST_FILES_DIR}`, `d1/d11`))!

      expect(actual.path).toBe(`d1/d11`)
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })

    it('basePath直下のノードが検索対象の場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
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
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const actual = (await storageService.getNode(`${TEST_FILES_DIR}`, `d1`))!

      expect(actual.path).toBe(`d1`)
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })

    it('大量データの場合 - ディレクトリ', async () => {
      // ディレクトリを作成
      const dirPaths: string[] = []
      for (let i = 1; i <= 20; i++) {
        dirPaths.push(`dirs/dir${i.toString().padStart(2, '0')}`)
      }
      await storageService.createDirs(`${TEST_FILES_DIR}`, dirPaths)

      // 大量データを想定して分割検索を行う
      const actual = (await storageService.getNode(`${TEST_FILES_DIR}`, `dirs/dir20`, { maxChunk: 3 }))!

      expect(actual.path).toBe(`dirs/dir20`)
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })

    it('大量データの場合 - ファイル', async () => {
      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = []
      for (let i = 1; i <= 20; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `dirs/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 大量データを想定して分割検索を行う
      const actual = (await storageService.getNode(`${TEST_FILES_DIR}`, `dirs/file20.txt`, { maxChunk: 3 }))!

      expect(actual.path).toBe(`dirs/file20.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })
  })

  describe('getHierarchicalNode', () => {
    it('ベーシックケース - 引数にファイルを指定', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11/d111`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/d111/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = await storageService.getHierarchicalNode(null, `${TEST_FILES_DIR}/d1/d11/d111/fileA.txt`)

      expect(actual.length).toBe(5)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/d111`)
      expect(actual[4].path).toBe(`${TEST_FILES_DIR}/d1/d11/d111/fileA.txt`)
      await existsNodes(null, actual)
    })

    it(`basePathを指定した場合`, async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11/d111`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/d111/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const actual = await storageService.getHierarchicalNode(`/${TEST_FILES_DIR}/`, `/d1/d11/d111/fileA.txt/`)

      expect(actual.length).toBe(4)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/d111`)
      expect(actual[3].path).toBe(`d1/d11/d111/fileA.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, actual)
    })
  })

  describe('getAncestorDirs', () => {
    it('ベーシックケース - 引数にファイルを指定', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11/d111`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/d111/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = await storageService.getAncestorDirs(null, `${TEST_FILES_DIR}/d1/d11/d111/fileA.txt`)

      expect(actual.length).toBe(4)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/d111`)
      await existsNodes(null, actual)
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11/d111`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/d111/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const actual = await storageService.getAncestorDirs(`/${TEST_FILES_DIR}/`, `/d1/d11/d111/fileA.txt/`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/d111`)
      await existsNodes(`${TEST_FILES_DIR}`, actual)
    })
  })

  describe('createDirs', () => {
    it('ベーシックケース', async () => {
      const actual = await storageService.createDirs(null, [
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
      await existsNodes(null, actual)
    })

    it('既に存在するディレクトリを作成しようとした場合', async () => {
      const [, d1] = await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      const actual = await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      expect(actual.length).toBe(0)
      const afterD1 = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)
      expect(d1.created).toEqual(afterD1.created)
      expect(d1.updated).toEqual(afterD1.updated)
    })

    it('basePathを指定した場合', async () => {
      const actual = await storageService.createDirs(`${TEST_FILES_DIR}`, [`d3`, `d1/d11`, `d1/d12`, `d2/d21`])

      expect(actual.length).toBe(6)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d12`)
      expect(actual[3].path).toBe(`d2`)
      expect(actual[4].path).toBe(`d2/d21`)
      expect(actual[5].path).toBe(`d3`)
      await existsNodes(`${TEST_FILES_DIR}`, actual)
    })

    it(`パスの先頭・末尾に'/'を付与`, async () => {
      // パスの先頭・末尾に'/'を付与
      const actual = await storageService.createDirs(`/${TEST_FILES_DIR}/`, [`/d3/`, `/d1/d11/`, `/d1/d12/`, `/d2/d21/`])

      expect(actual.length).toBe(6)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d12`)
      expect(actual[3].path).toBe(`d2`)
      expect(actual[4].path).toBe(`d2/d21`)
      expect(actual[5].path).toBe(`d3`)
      await existsNodes(`/${TEST_FILES_DIR}/`, actual)
    })

    it('作成ディレクトリパスへのバリデーション実行確認', async () => {
      const validatePath = td.replace(storageService, 'validatePath')

      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      const explanation = td.explain(validatePath)
      expect(explanation.calls.length).toBe(2)
      expect(explanation.calls[0].args[0]).toBe(`${TEST_FILES_DIR}/d1`)
      expect(explanation.calls[1].args[0]).toBe(`${TEST_FILES_DIR}/d2`)
    })
  })

  describe('handleUploadedFiles', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d12`])

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
      await storageService.uploadAsFiles(null, uploadItems)

      // ファイルアップロードの後処理を実行
      await storageService.handleUploadedFiles(
        null,
        uploadItems.map(item => item.path)
      )
      const actual = await storageService.getRealNodes(null, [
        `${TEST_FILES_DIR}/d1/d11/`,
        `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        `${TEST_FILES_DIR}/d1/d12/fileB.txt`,
      ])

      // 'd1/d11'ディレクトリが作成された
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d12/fileB.txt`)

      await existsNodes(null, actual)
    })

    it('複数回実行した場合', async () => {
      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // ファイルアップロードの後処理を実行 - 1
      await storageService.handleUploadedFiles(
        null,
        uploadItems.map(item => item.path)
      )
      const fileA_1 = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d1/d11/fileA.txt`)

      // ファイルアップロードの後処理を実行 - 2
      await storageService.handleUploadedFiles(
        null,
        uploadItems.map(item => item.path)
      )
      const fileA_2 = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d1/d11/fileA.txt`)

      // 1回目と2回目でidが同じことを検証
      expect(fileA_1.id).toBe(fileA_2.id)
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // ファイルアップロードの後処理を実行
      await storageService.handleUploadedFiles(
        `${TEST_FILES_DIR}`,
        uploadItems.map(item => item.path)
      )
      const actual = await storageService.getRealNodes(`${TEST_FILES_DIR}`, [`d1/d11/`, `d1/d11/fileA.txt`])

      // 'd1/d11'ディレクトリが作成された
      await existsNodes(`${TEST_FILES_DIR}`, actual)
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
      await storageService.uploadAsFiles(null, uploadItems)

      const validatePath = td.replace(storageService, 'validatePath')

      await storageService.handleUploadedFiles(null, [`${TEST_FILES_DIR}/d1/fileA.txt`, `${TEST_FILES_DIR}/d2/fileB.txt`])

      const explanation = td.explain(validatePath)
      expect(explanation.calls.length).toBe(2)
      expect(explanation.calls[0].args[0]).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(explanation.calls[1].args[0]).toBe(`${TEST_FILES_DIR}/d2/fileB.txt`)
    })

    it('存在しないファイルを指定した場合', async () => {
      let actual: Error
      try {
        await storageService.handleUploadedFiles(null, [`${TEST_FILES_DIR}/d1/fileA.txt`])
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`Uploaded file not found: '${TEST_FILES_DIR}/d1/fileA.txt'`)
    })
  })

  describe('removeDirs', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      await storageService.removeDirs(null, [`${TEST_FILES_DIR}/d1`])
      const actual = await storageService.getRealNodes(null, [
        `${TEST_FILES_DIR}/d1/`,
        `${TEST_FILES_DIR}/d1/fileA.txt`,
        `${TEST_FILES_DIR}/d1/fileB.txt`,
      ])

      await notExistsNodes(null, actual)
    })

    it(`'d1/d11'と親である'd1'を同時に指定した場合`, async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d1/d12`, `${TEST_FILES_DIR}/d2/d21`])

      // 作成したディレクトリにファイルをアップロード
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
        {
          data: 'testC',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d2/d21/fileC.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 'd1/d11'と親である'd1'を同時に指定してみる
      await storageService.removeDirs(null, [`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2/d21`])
      const actual = await storageService.getRealNodes(null, [
        `${TEST_FILES_DIR}/d1/`,
        `${TEST_FILES_DIR}/d1/d11/`,
        `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        `${TEST_FILES_DIR}/d1/d12/`,
        `${TEST_FILES_DIR}/d1/d12/fileB.txt`,
        `${TEST_FILES_DIR}/d2/d21/`,
        `${TEST_FILES_DIR}/d2/d21/fileC.txt`,
      ])

      await notExistsNodes(null, actual)
    })

    it('ファイルに対するディレクトリがないディレクトリを指定した場合', async () => {
      // ディレクトリを作成せずファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      await storageService.removeDirs(null, [`${TEST_FILES_DIR}/d1`])
      const actual = await storageService.getRealNodes(null, [
        `${TEST_FILES_DIR}/d1/`,
        `${TEST_FILES_DIR}/d1/fileA.txt`,
        `${TEST_FILES_DIR}/d1/fileB.txt`,
      ])

      await notExistsNodes(null, actual)
    })

    it('ディレクトリの一部が存在しない場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11/d111`])

      // ディレクトリ階層の中間のディレクトリを削除する
      const d11 = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1/d11`)
      await d11.gcsNode.delete()

      await storageService.removeDirs(null, [`${TEST_FILES_DIR}/d1`])
      const actual = await storageService.getRealNodes(null, [`${TEST_FILES_DIR}/d1/`, `${TEST_FILES_DIR}/d1/d11/`, `${TEST_FILES_DIR}/d1/d11/d111/`])

      await notExistsNodes(null, actual)
    })

    it('存在しないディレクトリを指定した場合', async () => {
      // 何も行われない(エラーも発生しない)
      await storageService.removeDirs(null, [`${TEST_FILES_DIR}/d1`])
    })

    it('basePathを指定した場合', async () => {
      const uploadItems: UploadDataItem[] = [
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
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      await storageService.removeDirs(`${TEST_FILES_DIR}`, [`d1`])
      const actual = await storageService.getRealNodes(null, [`d1/`, `d1/fileA.txt`, `d1/fileB.txt`])

      await notExistsNodes(`${TEST_FILES_DIR}`, actual)
    })

    it(`パスの先頭・末尾に'/'を付与`, async () => {
      const uploadItems: UploadDataItem[] = [
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
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      await storageService.removeDirs(`/${TEST_FILES_DIR}/`, [`/d1/`])
      const actual = await storageService.getRealNodes(null, [`d1/`, `d1/fileA.txt`, `d1/fileB.txt`])

      await notExistsNodes(`${TEST_FILES_DIR}`, actual)
    })

    it('dirPathsに空文字が含まれている場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 空文字を指定
      // 何も行われない(エラーも発生しない)
      await storageService.removeDirs(null, ['', undefined, null as any])
    })

    it('大量データの場合', async () => {
      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = []
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
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 大量データを想定して分割削除を行う
      await storageService.removeDirs(`${TEST_FILES_DIR}`, [`d1/d11`, `d1/d12`], { maxChunk: 3 })
      const actual = await storageService.getRealNodes(`${TEST_FILES_DIR}`, [
        `d1/d11/`,
        `d1/d11/d111/`,
        `d1/d11/d111/file01.txt`,
        `d1/d11/d111/file02.txt`,
        `d1/d11/d111/file03.txt`,
        `d1/d11/d111/file04.txt`,
        `d1/d11/d111/file05.txt`,
        `d1/d12/`,
        `d1/d12/file06.txt`,
        `d1/d12/file07.txt`,
        `d1/d12/file08.txt`,
        `d1/d12/file09.txt`,
        `d1/d12/file10.txt`,
      ])

      await notExistsNodes(`${TEST_FILES_DIR}`, actual)
    })
  })

  describe('removeFiles', () => {
    it('ベーシックケース', async () => {
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
      await storageService.uploadAsFiles(null, uploadItems)

      await storageService.removeFiles(null, [`${TEST_FILES_DIR}/d1/fileA.txt`, `${TEST_FILES_DIR}/d2/fileB.txt`])
      const actual = await storageService.getRealNodes(null, [`${TEST_FILES_DIR}/d1/fileA.txt`, `${TEST_FILES_DIR}/d2/fileB.txt`])

      await notExistsNodes(null, actual)
    })

    it('basePathを指定した場合', async () => {
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `d2/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      await storageService.removeFiles(`${TEST_FILES_DIR}`, [`d1/fileA.txt`, `d2/fileB.txt`])
      const actual = await storageService.getRealNodes(`${TEST_FILES_DIR}`, [`d1/fileA.txt`, `d2/fileB.txt`])

      await notExistsNodes(`${TEST_FILES_DIR}`, actual)
    })

    it(`パスの先頭・末尾に'/'を付与`, async () => {
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `d2/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // パスの先頭・末尾に'/'を付与
      await storageService.removeFiles(`/${TEST_FILES_DIR}/`, [`/d1/fileA.txt/`, `/d2/fileB.txt/`])
      const actual = await storageService.getRealNodes(`/${TEST_FILES_DIR}/`, [`d1/fileA.txt`, `d2/fileB.txt`])

      await notExistsNodes(`${TEST_FILES_DIR}`, actual)
    })

    it('存在しないファイルを指定', async () => {
      // 何も行われない(エラーも発生しない)
      await storageService.removeFiles(null, [`${TEST_FILES_DIR}/d1/fileXXX.txt`])
    })

    it('filePathsに空文字が含まれている場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 空文字を指定
      // 何も行われない(エラーも発生しない)
      await storageService.removeFiles(null, ['', undefined, null as any])
    })

    it('大量データの場合', async () => {
      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = []
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
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 大量データを想定して分割削除を行う
      await storageService.removeFiles(
        `${TEST_FILES_DIR}`,
        [
          `d1/d11/d111/file01.txt`,
          `d1/d11/d111/file02.txt`,
          `d1/d11/d111/file03.txt`,
          `d1/d11/d111/file04.txt`,
          `d1/d11/d111/file05.txt`,
          `d1/d12/file06.txt`,
          `d1/d12/file07.txt`,
          `d1/d12/file08.txt`,
          `d1/d12/file09.txt`,
          `d1/d12/file10.txt`,
        ],
        { maxChunk: 3 }
      )
      const actual = await storageService.getRealNodes(`${TEST_FILES_DIR}`, [
        `d1/d11/d111/file01.txt`,
        `d1/d11/d111/file02.txt`,
        `d1/d11/d111/file03.txt`,
        `d1/d11/d111/file04.txt`,
        `d1/d11/d111/file05.txt`,
        `d1/d12/file06.txt`,
        `d1/d12/file07.txt`,
        `d1/d12/file08.txt`,
        `d1/d12/file09.txt`,
        `d1/d12/file10.txt`,
      ])

      await notExistsNodes(`${TEST_FILES_DIR}`, actual)
    })
  })

  describe('moveDir', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 移動前のノードを取得
      const fromDirNodes = (await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/d1`)).list
      expect(fromDirNodes.length).toBe(3)

      // 'd1'を'd2/d1'へ移動
      await storageService.moveDir(null, `${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2/d1`)
      const actual = (await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/d2/d1`)).list

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d2/d1`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d2/d1/d11`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d2/d1/d11/fileA.txt`)
      await existsNodes(null, actual)
      await notExistsNodes(null, fromDirNodes)
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11`, `d2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 移動前のノードを取得
      const fromDirNodes = (await storageService.getDirDescendants(`${TEST_FILES_DIR}`, `d1`)).list
      expect(fromDirNodes.length).toBe(3)

      // 'd1'を'd2/d1'へ移動
      await storageService.moveDir(`${TEST_FILES_DIR}`, `d1`, `d2/d1`)
      const actual = (await storageService.getDirDescendants(`${TEST_FILES_DIR}`, `d2/d1`)).list

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d2/d1`)
      expect(actual[1].path).toBe(`d2/d1/d11`)
      expect(actual[2].path).toBe(`d2/d1/d11/fileA.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, actual)
      await notExistsNodes(`${TEST_FILES_DIR}`, fromDirNodes)
    })

    it(`パスの先頭・末尾に'/'を付与`, async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11`, `d2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 移動前のノードを取得
      const fromDirNodes = (await storageService.getDirDescendants(`${TEST_FILES_DIR}`, `d1`)).list
      expect(fromDirNodes.length).toBe(3)

      // 'd1'を'd2/d1'へ移動
      // パスの先頭・末尾に'/'を付与
      await storageService.moveDir(`/${TEST_FILES_DIR}/`, `/${fromDirNodes[0].path}/`, `/d2/d1/`)
      const actual = (await storageService.getDirDescendants(`${TEST_FILES_DIR}`, `d2/d1`)).list

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d2/d1`)
      expect(actual[1].path).toBe(`d2/d1/d11`)
      expect(actual[2].path).toBe(`d2/d1/d11/fileA.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, actual)
      await notExistsNodes(`${TEST_FILES_DIR}`, fromDirNodes)
    })

    it('移動先に同名のディレクトリが存在する場合', async () => {
      // ディレクトリを作成
      // ('d1'と'd2'配下に'docs'を作成)
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/docs`, `${TEST_FILES_DIR}/d2/docs`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/docs/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d2/docs/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 移動前のノードを取得
      const fromDirNodes = (await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/d1/docs`)).list
      expect(fromDirNodes.length).toBe(2)

      // 'd1/docs'を'd2/docs'へ移動
      await storageService.moveDir(null, `${TEST_FILES_DIR}/d1/docs`, `${TEST_FILES_DIR}/d2/docs`)
      const actual = (await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/d2/docs`)).list

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d2/docs`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d2/docs/fileA.txt`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d2/docs/fileB.txt`)
      await existsNodes(null, actual)
      await notExistsNodes(null, fromDirNodes)
    })

    it('移動先に同名のファイルが存在する場合', async () => {
      // ディレクトリを作成
      // ('d1'と'd2'配下に'docs'を作成)
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/docs`, `${TEST_FILES_DIR}/d2/docs`])

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
      await storageService.uploadAsFiles(null, uploadItems)

      // 移動前のノードを取得
      const fromDirNodes = (await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/d1/docs`)).list
      expect(fromDirNodes.length).toBe(2)

      // 'd1/docs'を'd2/docs'へ移動
      await storageService.moveDir(null, `${TEST_FILES_DIR}/d1/docs`, `${TEST_FILES_DIR}/d2/docs`)
      const actual = (await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/d2/docs`)).list

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d2/docs`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d2/docs/file.txt`)
      await existsNodes(null, actual)
      await notExistsNodes(null, fromDirNodes)

      const fileNode = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d2/docs/file.txt`)
      const fileData = await fileNode.gcsNode.download()
      expect(fileData.toString()).toBe('testA')
    })

    it('移動元と移動先が同じ場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      let actual: Error
      try {
        const fromDirNode = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)
        await storageService.moveDir(null, fromDirNode.path, fromDirNode.path + '/') // 移動先に'/'を付けて試す
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The source and destination are the same: '${TEST_FILES_DIR}/d1' -> '${TEST_FILES_DIR}/d1'`)
    })

    it('移動元ディレクトリのサブディレクトリが実際には存在しない場合', async () => {
      // ディレクトリを作成
      // (移動元のサブディレクトリは作成しない)
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        // 'd11'といディレクトリは存在しないがアップロードはできる
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 移動前のノードを取得
      const fromDirNodes = await storageService.getRealNodes(null, [`${TEST_FILES_DIR}/d1/`, `${TEST_FILES_DIR}/d1/d11/file1.txt`])

      // 'd1'を'd2/d1'へ移動
      await storageService.moveDir(null, `${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2/d1`)
      const actual = await storageService.getRealNodes(null, [
        `${TEST_FILES_DIR}/d2/d1/`,
        `${TEST_FILES_DIR}/d2/d1/d11/`,
        `${TEST_FILES_DIR}/d2/d1/d11/fileA.txt`,
      ])

      // 移動元に存在しなかったディレクトリが作成されていることを検証
      expect(actual[0].exists).toBe(true)
      expect(actual[1].exists).toBe(true) // ← 移動元に存在しなかったディレクトリが作成されている
      expect(actual[2].exists).toBe(true)
      await existsNodes(null, actual)
      await notExistsNodes(null, fromDirNodes)
    })

    it('移動元ディレクトリが存在しない場合', async () => {
      // ディレクトリを作成
      // (移動元ディレクトリは作成しない)
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      let actual: Error
      try {
        await storageService.moveDir(null, `${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2/d1`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The source directory does not exist: '${TEST_FILES_DIR}/d1'`)
    })

    it('移動先ディレクトリが存在しない場合', async () => {
      // ディレクトリを作成
      // (移動先ディレクトリ'd2'は作成しない)
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 存在しない'd2'配下へ'd1'を移動させる
      let actual: Error
      try {
        await storageService.moveDir(`${TEST_FILES_DIR}`, `d1`, `d2/d1`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The destination directory does not exist: '${TEST_FILES_DIR}/d2'`)
    })

    it('移動先ディレクトリが存在しない場合 - ルートディレクトリ(アプリケーションまたはユーザーディレクトリ)直下へ移動する場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/docs`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/docs/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 移動前のノードを取得
      const fromDirNodes = (await storageService.getDirDescendants(`${TEST_FILES_DIR}`, `d1/docs`)).list
      expect(fromDirNodes.length).toBe(2)

      // ルートディレクトリ(アプリケーションまたはユーザーディレクトリ)直下へ移動
      // 'd1/docs'をルートディレクトリ直下'docs'へ移動
      await storageService.moveDir(`${TEST_FILES_DIR}`, `d1/docs`, `docs`)
      const actual = (await storageService.getDirDescendants(`${TEST_FILES_DIR}`, `docs`)).list

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`docs`)
      expect(actual[1].path).toBe(`docs/fileA.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, actual)
      await notExistsNodes(`${TEST_FILES_DIR}`, fromDirNodes)
    })

    it('移動先ディレクトリが移動元のサブディレクトリの場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      let actual!: Error
      try {
        await storageService.moveDir(null, `${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d1/aaa/bbb/d1`)
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The destination directory is its own subdirectory: '${TEST_FILES_DIR}/d1' -> '${TEST_FILES_DIR}/d1/aaa/bbb/d1'`)
    })

    it('移動元から移動先に共有設定が引き継がれるか検証', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 共有設定
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true, uids: ['ichiro'] })
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1/d11`, { isPublic: true, uids: ['jiro'] })
      await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/d11/fileA.txt`, { isPublic: true, uids: ['saburo'] })

      // 移動前のノードを取得
      const fromDirNodes = (await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/d1`)).list

      // 'd1'を'd2/d1'へ移動
      await storageService.moveDir(null, fromDirNodes[0].path, `${TEST_FILES_DIR}/d2/d1`)
      const actual = (await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/d2/d1`)).list

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d2/d1`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d2/d1/d11`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d2/d1/d11/fileA.txt`)
      // 移動後のノードに共有設定が引き継がれていることを検証
      expect(actual[0].share).toEqual({ isPublic: true, uids: ['ichiro'] })
      expect(actual[1].share).toEqual({ isPublic: true, uids: ['jiro'] })
      expect(actual[2].share).toEqual({ isPublic: true, uids: ['saburo'] })
      await existsNodes(null, actual)
      await notExistsNodes(null, fromDirNodes)
    })

    it('移動先ディレクトリパスへのバリデーション実行確認', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // バリデーションメソッドのモック化
      const validatePath = td.replace(storageService, 'validatePath')

      await storageService.moveDir(null, `${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`)

      const explanation = td.explain(validatePath)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(`${TEST_FILES_DIR}/d2`)
    })

    it('大量データの場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = []
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
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 移動前のノードを取得
      const fromDirNodes = (await storageService.getDirDescendants(`${TEST_FILES_DIR}`, `d1`)).list

      // 大量データを想定して分割で移動を行う
      // 'd1'を'd/d1'へ移動
      await storageService.moveDir(`${TEST_FILES_DIR}`, `d1`, `d/d1`, { maxChunk: 3 })
      const actual = (await storageService.getDirDescendants(`${TEST_FILES_DIR}`, `d`)).list

      expect(actual.length).toBe(15)
      expect(actual[0].path).toBe(`d`)
      expect(actual[1].path).toBe(`d/d1`)
      expect(actual[2].path).toBe(`d/d1/d11`)
      expect(actual[3].path).toBe(`d/d1/d11/d111`)
      expect(actual[4].path).toBe(`d/d1/d11/d111/file01.txt`)
      expect(actual[5].path).toBe(`d/d1/d11/d111/file02.txt`)
      expect(actual[6].path).toBe(`d/d1/d11/d111/file03.txt`)
      expect(actual[7].path).toBe(`d/d1/d11/d111/file04.txt`)
      expect(actual[8].path).toBe(`d/d1/d11/d111/file05.txt`)
      expect(actual[9].path).toBe(`d/d1/d12`)
      expect(actual[10].path).toBe(`d/d1/d12/file06.txt`)
      expect(actual[11].path).toBe(`d/d1/d12/file07.txt`)
      expect(actual[12].path).toBe(`d/d1/d12/file08.txt`)
      expect(actual[13].path).toBe(`d/d1/d12/file09.txt`)
      expect(actual[14].path).toBe(`d/d1/d12/file10.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, actual)
      await notExistsNodes(null, fromDirNodes)
    })
  })

  describe('moveFile', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const fromFileNode = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)
      await storageService.moveFile(null, fromFileNode.path, `${TEST_FILES_DIR}/d2/fileA.txt`)
      const actual = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d2/fileA.txt`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d2/fileA.txt`)
      await existsNodes(null, [actual])
      await notExistsNodes(null, [fromFileNode])
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`, `d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const fromFileNode = await storageService.getRealFileNode(`${TEST_FILES_DIR}`, `d1/fileA.txt`)
      await storageService.moveFile(`${TEST_FILES_DIR}`, fromFileNode.path, `d2/fileA.txt`)
      const actual = await storageService.getRealFileNode(`${TEST_FILES_DIR}`, `d2/fileA.txt`)

      expect(actual.path).toBe(`d2/fileA.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
      await notExistsNodes(`${TEST_FILES_DIR}`, [fromFileNode])
    })

    it(`パスの先頭・末尾に'/'を付与した場合`, async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`, `d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // パスの先頭・末尾に'/'を付与
      const fromFileNode = await storageService.getRealFileNode(`/${TEST_FILES_DIR}/`, `/d1/fileA.txt/`)
      await storageService.moveFile(`/${TEST_FILES_DIR}/`, fromFileNode.path, `/d2/fileA.txt/`)
      const actual = await storageService.getRealFileNode(`/${TEST_FILES_DIR}/`, `/d2/fileA.txt/`)

      expect(actual.path).toBe(`d2/fileA.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
      await notExistsNodes(`${TEST_FILES_DIR}`, [fromFileNode])
    })

    it('移動先に同名のファイルが存在する場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

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
      await storageService.uploadAsFiles(null, uploadItems)

      const fromFileNode = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d1/file.txt`)
      await storageService.moveFile(null, fromFileNode.path, `${TEST_FILES_DIR}/d2/file.txt`)
      const actual = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d2/file.txt`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d2/file.txt`)
      await existsNodes(null, [actual])
      await notExistsNodes(null, [fromFileNode])

      const toFileNode = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d2/file.txt`)
      const toFileData = await toFileNode.gcsNode.download()
      expect(toFileData.toString()).toBe('testA')
    })

    it('移動元ファイルがない場合', async () => {
      let actual: Error
      try {
        const fromFileNode = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)
        await storageService.moveFile(null, fromFileNode.path, `${TEST_FILES_DIR}/d2/fileA.txt`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The source file does not exist: '${TEST_FILES_DIR}/d1/fileA.txt'`)
    })

    it('移動先ディレクトリがない場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      let actual!: Error
      try {
        const fromFileNode = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)
        await storageService.moveFile(null, fromFileNode.path, `${TEST_FILES_DIR}/d2/fileA.txt`)
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The destination directory does not exist: '${TEST_FILES_DIR}/d2'`)
    })

    it('移動先ファイルパスへのバリデーション実行確認', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // バリデーションメソッドのモック化
      const validatePath = td.replace(storageService, 'validatePath')

      await storageService.moveFile(null, `${TEST_FILES_DIR}/d1/fileA.txt`, `${TEST_FILES_DIR}/d2/fileA.txt`)

      const explanation = td.explain(validatePath)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(`${TEST_FILES_DIR}/d2/fileA.txt`)
    })
  })

  describe('renameDir', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const dirNode = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)
      await storageService.renameDir(null, dirNode.path, `d2`)
      const actual = (await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/d2`)).list

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d2`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d2/d11`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d2/d11/fileA.txt`)
      await existsNodes(null, actual)
      await notExistsNodes(null, [dirNode])
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const dirNode = await storageService.getRealDirNode(`${TEST_FILES_DIR}`, `d1`)
      await storageService.renameDir(`${TEST_FILES_DIR}`, dirNode.path, `d2`)
      const actual = (await storageService.getDirDescendants(`${TEST_FILES_DIR}`, `d2`)).list

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d2`)
      expect(actual[1].path).toBe(`d2/d11`)
      expect(actual[2].path).toBe(`d2/d11/fileA.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, actual)
      await notExistsNodes(`${TEST_FILES_DIR}`, [dirNode])
    })

    it(`パスの先頭・末尾に'/'を付与`, async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // パスの先頭・末尾に'/'を付与
      const dirNode = await storageService.getRealDirNode(`/${TEST_FILES_DIR}/`, `/d1/`)
      await storageService.renameDir(`/${TEST_FILES_DIR}/`, dirNode.path, `d2`)
      const actual = (await storageService.getDirDescendants(`/${TEST_FILES_DIR}/`, `d2`)).list

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d2`)
      expect(actual[1].path).toBe(`d2/d11`)
      expect(actual[2].path).toBe(`d2/d11/fileA.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, actual)
      await notExistsNodes(`${TEST_FILES_DIR}`, [dirNode])
    })

    it('リネームしようとする名前のディレクトリが既に存在する場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/docs`, `${TEST_FILES_DIR}/d1/files`])

      let actual: Error
      try {
        // 'd1/docs'を'd1/files'へリネーム
        const dirNode = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1/docs`)
        await storageService.renameDir(null, dirNode.path, `files`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The specified directory name already exists: '${TEST_FILES_DIR}/d1/docs' -> '${TEST_FILES_DIR}/d1/files'`)
    })

    it('ディレクトリパスにディレクトリ名と同じディレクトリがあった場合', async () => {
      // ディレクトリを作成
      // あえて'd1/d1'というディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        // 'd1/d1'というディレクトリにファイルを配置
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 'd1/d1'を'd1/d2'へリネーム
      const dirNode = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1/d1`)
      await storageService.renameDir(null, dirNode.path, `d2`)
      const actual = (await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/d1/d2`)).list

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1/d2`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1/d2/fileA.txt`)
      await existsNodes(null, actual)
      await notExistsNodes(null, [dirNode])
    })

    it('既存のディレクトリ名に文字を付け加える形でリネームをした場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // 'd1'を'd1XXX'へリネーム
      const dirNode = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)
      await storageService.renameDir(null, dirNode.path, `d1XXX`)
      const actual = (await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/d1XXX`)).list

      expect(actual.length).toBe(1)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1XXX`)
      await existsNodes(null, actual)
      await notExistsNodes(null, [dirNode])
    })

    it('リネームディレクトリパスへのバリデーション実行確認', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // バリデーションメソッドのモック化
      const validateDirName = td.replace(storageService, 'validateDirName')

      await storageService.renameDir(null, `${TEST_FILES_DIR}/d1`, `d2`)

      const explanation = td.explain(validateDirName)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(`d2`)
    })
  })

  describe('renameFile', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const fromFileNode = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)
      await storageService.renameFile(null, fromFileNode.path, `fileB.txt`)
      const actual = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d1/fileB.txt`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1/fileB.txt`)
      await existsNodes(null, [actual])
      await notExistsNodes(null, [fromFileNode])
    })

    it('basePathを指定', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const fileNode = await storageService.getRealFileNode(`${TEST_FILES_DIR}`, `d1/fileA.txt`)
      await storageService.renameFile(`${TEST_FILES_DIR}`, fileNode.path, `fileB.txt`)
      const actual = await storageService.getRealFileNode(`${TEST_FILES_DIR}`, `d1/fileB.txt`)

      expect(actual.path).toBe(`d1/fileB.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
      await notExistsNodes(`${TEST_FILES_DIR}`, [fileNode])
    })

    it(`basePathを指定 - パスの先頭・末尾に'/'を付与`, async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // パスの先頭・末尾に'/'を付与
      const fileNode = await storageService.getRealFileNode(`/${TEST_FILES_DIR}/`, `/d1/fileA.txt/`)
      await storageService.renameFile(`/${TEST_FILES_DIR}/`, fileNode.path, 'fileB.txt')
      const actual = await storageService.getRealFileNode(`/${TEST_FILES_DIR}/`, `/d1/fileB.txt/`)

      expect(actual.path).toBe(`d1/fileB.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
      await notExistsNodes(`${TEST_FILES_DIR}`, [fileNode])
    })

    it('リネームしようとする名前のファイルが既に存在する場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      let actual: Error
      try {
        // 'd1/fileA.txt'を'd1/fileB.txt'へリネーム
        const fileNode = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)
        await storageService.renameFile(null, fileNode.path, `fileB.txt`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The specified file name already exists: '${TEST_FILES_DIR}/d1/fileA.txt' -> '${TEST_FILES_DIR}/d1/fileB.txt'`)
    })

    it('ファイルパスにファイル名と同じディレクトリがあった場合', async () => {
      // ディレクトリを作成
      // あえて'd1/fileA.txt'というディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/fileA.txt`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        // 'd1/fileA.txt'というディレクトリに'fileA.txt'というファイルを配置
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const fileNode = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt/fileA.txt`)
      await storageService.renameFile(null, fileNode.path, 'fileB.txt')
      const actual = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt/fileB.txt`)

      // 'fileA.txt'というディレクトリ名は変わらず、
      // 'fileA.txt'が'fileB.txt'に名前変更されたことを確認
      expect(actual!.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt/fileB.txt`)
      await existsNodes(null, [actual])
      await notExistsNodes(null, [fileNode])
    })

    it('リネームディレクトリパスへのバリデーション実行確認', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // バリデーションメソッドのモック化
      const validateFileName = td.replace(storageService, 'validateFileName')

      await storageService.renameFile(null, `${TEST_FILES_DIR}/d1/fileA.txt`, `fileB.txt`)

      const explanation = td.explain(validateFileName)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(`fileB.txt`)
    })
  })

  describe('setDirShareSettings', () => {
    beforeEach(async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)
    })

    it('共有設定 - 設定なしの状態から公開フラグを設定', async () => {
      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1`)
        expect(node.share).toEqual({ isPublic: true } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await storageService.getRealDirNode(null, actual.path))
    })

    it('共有設定 - 設定なしの状態からユーザーIDを設定', async () => {
      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1`)
        expect(node.share).toEqual({ uids: ['ichiro'] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await storageService.getRealDirNode(null, actual.path))
    })

    it('共有設定 - 公開フラグがオンの状態からオフへ設定', async () => {
      // 公開フラグをオンに設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true })

      // 公開フラグをオフに設定
      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: false })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1`)
        expect(node.share).toEqual({ isPublic: false } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await storageService.getRealDirNode(null, actual.path))
    })

    it('共有設定 - 公開フラグがオンの状態からundefinedを設定', async () => {
      // 公開フラグをオンに設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true })

      // 公開フラグをnullに設定
      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: undefined })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1`)
        expect(node.share).toEqual(EMPTY_SHARE_SETTINGS)
      }
      verify(actual)
      verify(await storageService.getRealDirNode(null, actual.path))
    })

    it('共有設定 - ユーザーIDが設定されているの状態から空を設定', async () => {
      // ユーザーIDを設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })

      // ユーザーIDを未設定へ変更
      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { uids: [] })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1`)
        expect(node.share).toEqual({ uids: [] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await storageService.getRealDirNode(null, actual.path))
    })

    it('共有設定 - ユーザーIDが設定されているの状態からundefinedを設定', async () => {
      // ユーザーIDを設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })

      // ユーザーIDを未設定へ変更
      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { uids: undefined })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1`)
        expect(node.share).toEqual(EMPTY_SHARE_SETTINGS)
      }
      verify(actual)
      verify(await storageService.getRealDirNode(null, actual.path))
    })

    it('存在しないファイルを指定した場合', async () => {
      let actual!: Error
      try {
        await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/dXXX`, { isPublic: true })
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The specified directory does not exist: '${TEST_FILES_DIR}/dXXX'`)
    })

    it('settingsにnullを指定した場合', async () => {
      // 共有設定をしておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true, uids: ['ichiro'] })

      // nullを指定
      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, null)

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1`)
        expect(node.share).toEqual(EMPTY_SHARE_SETTINGS)
      }
      verify(actual)
      verify(await storageService.getRealDirNode(null, actual.path))
    })

    it('basePathを指定した場合', async () => {
      const settings: StorageNodeShareSettings = { isPublic: true, uids: ['ichiro'] }
      const actual = await storageService.setDirShareSettings(`${TEST_FILES_DIR}`, `d1`, settings)

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual(settings)
      }
      verify(actual)
      verify(await storageService.getRealDirNode(`${TEST_FILES_DIR}`, actual.path))
    })

    it(`basePathの先頭・末尾に'/'を付与`, async () => {
      const settings: StorageNodeShareSettings = { isPublic: true, uids: ['ichiro'] }
      const actual = await storageService.setDirShareSettings(`/${TEST_FILES_DIR}/`, `/d1/`, settings)

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual(settings)
      }
      verify(actual)
      verify(await storageService.getRealDirNode(`${TEST_FILES_DIR}`, actual.path))
    })
  })

  describe('setFileShareSettings', () => {
    beforeEach(async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)
    })

    it('共有設定 - 設定なしの状態から公開フラグを設定', async () => {
      const actual = await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/fileA.txt`, { isPublic: true })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
        expect(node.share).toEqual({ isPublic: true } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await storageService.getRealFileNode(null, actual.path))
    })

    it('共有設定 - 設定なしの状態からユーザーIDを設定', async () => {
      const actual = await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/fileA.txt`, { uids: ['ichiro'] })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
        expect(node.share).toEqual({ uids: ['ichiro'] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await storageService.getRealFileNode(null, actual.path))
    })

    it('共有設定 - 公開フラグがオンの状態からオフへ設定', async () => {
      // 公開フラグをオンに設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true })

      // 公開フラグをオフに設定
      const actual = await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/fileA.txt`, { isPublic: false })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
        expect(node.share).toEqual({ isPublic: false } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await storageService.getRealFileNode(null, actual.path))
    })

    it('共有設定 - 公開フラグがオンの状態からundefinedを設定', async () => {
      // 公開フラグをオンに設定しておく
      await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/fileA.txt`, { isPublic: true })

      // 公開フラグをnullに設定
      const actual = await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/fileA.txt`, { isPublic: undefined })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
        expect(node.share).toEqual(EMPTY_SHARE_SETTINGS)
      }
      verify(actual)
      verify(await storageService.getRealFileNode(null, actual.path))
    })

    it('共有設定 - ユーザーIDが設定されている状態から空を設定', async () => {
      // ユーザーIDを設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })

      // ユーザーIDを未設定へ変更
      const actual = await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/fileA.txt`, { uids: [] })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
        expect(node.share).toEqual({ uids: [] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await storageService.getRealFileNode(null, actual.path))
    })

    it('共有設定 - ユーザーIDが設定されているの状態からundefinedを設定', async () => {
      // ユーザーIDを設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })

      // ユーザーIDを未設定へ変更
      const actual = await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/fileA.txt`, { uids: undefined })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
        expect(node.share).toEqual(EMPTY_SHARE_SETTINGS)
      }
      verify(actual)
      verify(await storageService.getRealFileNode(null, actual.path))
    })

    it('存在しないファイルを指定した場合', async () => {
      let actual!: Error
      try {
        await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/zzz.txt`, { isPublic: true })
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The specified file does not exist: '${TEST_FILES_DIR}/d1/zzz.txt'`)
    })

    it('nullを指定した場合', async () => {
      // 共有設定をしておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true, uids: ['ichiro'] })

      // nullを指定
      const actual = await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/fileA.txt`, null)

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
        expect(node.share).toEqual(EMPTY_SHARE_SETTINGS)
      }
      verify(actual)
      verify(await storageService.getRealFileNode(null, actual.path))
    })

    it('basePathを指定した場合', async () => {
      const settings: StorageNodeShareSettings = { isPublic: true, uids: ['ichiro'] }
      const actual = await storageService.setFileShareSettings(`${TEST_FILES_DIR}`, `d1/fileA.txt`, settings)

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual(settings)
      }
      verify(actual)
      verify(await storageService.getRealFileNode(`${TEST_FILES_DIR}`, actual.path))
    })

    it(`basePathの先頭・末尾に'/'を付与`, async () => {
      const settings: StorageNodeShareSettings = { isPublic: true, uids: ['ichiro'] }
      const actual = await storageService.setFileShareSettings(`/${TEST_FILES_DIR}/`, `/d1/fileA.txt/`, settings)

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual(settings)
      }
      verify(actual)
      verify(await storageService.getRealFileNode(`${TEST_FILES_DIR}`, actual.path))
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

  describe('getRealNode', () => {
    it('ディレクトリの取得', async () => {
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      const actual = await storageService.getRealNode(null, `${TEST_FILES_DIR}/d1/`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.exists).toBeTruthy()
      await existsNodes(null, [actual])
    })

    it('ディレクトリの取得 - basePathを指定', async () => {
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

      const actual = await storageService.getRealNode(`${TEST_FILES_DIR}`, `d1/`)

      expect(actual.path).toBe(`d1`)
      expect(actual.exists).toBeTruthy()
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })

    it(`ディレクトリの取得 - パスの先頭・末尾に'/'を付与`, async () => {
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

      const actual = await storageService.getRealNode(`/${TEST_FILES_DIR}/`, `/d1/`)

      expect(actual.path).toBe(`d1`)
      expect(actual.exists).toBeTruthy()
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })

    it(`ディレクトリの取得 - 引数のパス指定で末尾に'/'を付与しない場合`, async () => {
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // 末尾に'/'を付与しない
      const actual = await storageService.getRealNode(null, `${TEST_FILES_DIR}/d1`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      // 末尾に'/'を付与しなかったのでディレクトリノードは取得されない
      expect(actual.exists).toBeFalsy()
    })

    it('ファイルの取得', async () => {
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = await storageService.getRealNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(actual.exists).toBeTruthy()
      await existsNodes(null, [actual])
    })

    it('ファイルの取得 - basePathを指定', async () => {
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const actual = await storageService.getRealNode(`${TEST_FILES_DIR}`, `d1/fileA.txt`)

      expect(actual.path).toBe(`d1/fileA.txt`)
      expect(actual.exists).toBeTruthy()
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })

    it(`ファイルの取得 - パスの先頭・末尾に'/'を付与`, async () => {
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // パスの先頭・末尾に'/'を付与
      const actual = await storageService.getRealNode(`/${TEST_FILES_DIR}/`, `/d1/fileA.txt`)

      expect(actual.path).toBe(`d1/fileA.txt`)
      expect(actual.exists).toBeTruthy()
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })
  })

  describe('getRealDirNode', () => {
    it('ベーシックケース', async () => {
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      const actual = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.exists).toBeTruthy()
      await existsNodes(null, [actual])
    })

    it(`basePathを指定した場合 + パスの先頭・末尾に'/'を付与`, async () => {
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

      // パスの先頭・末尾に'/'を付与
      const actual = await storageService.getRealDirNode(`/${TEST_FILES_DIR}/`, `/d1/`)

      expect(actual.path).toBe(`d1`)
      expect(actual.exists).toBeTruthy()
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })
  })

  describe('getRealFileNode', () => {
    it('ベーシックケース', async () => {
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(actual.exists).toBeTruthy()
      await existsNodes(null, [actual])
    })

    it(`basePathを指定した場合 + パスの先頭・末尾に'/'を付与`, async () => {
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // パスの先頭・末尾に'/'を付与
      const actual = await storageService.getRealFileNode(`/${TEST_FILES_DIR}/`, `/d1/fileA.txt/`)

      expect(actual.path).toBe(`d1/fileA.txt`)
      expect(actual.exists).toBeTruthy()
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })
  })

  describe('Serve files', () => {
    //--------------------------------------------------
    //  Test helpers
    //--------------------------------------------------

    let app: any

    beforeEach(async () => {
      app = testingModule.createNestApplication()
      await app.init()
    })

    //--------------------------------------------------
    //  Tests
    //--------------------------------------------------

    describe('serveFile', () => {
      it('画像ファイルをダウンロード', async () => {
        const localFilePath = `${__dirname}/${TEST_FILES_DIR}/desert.jpg`
        const toFilePath = `${TEST_FILES_DIR}/d1/desert.jpg`
        await storageService.uploadLocalFiles(null, [{ localFilePath, toFilePath }])

        return request(app.getHttpServer())
          .get(`/storage/${toFilePath}`)
          .expect(200)
          .then((res: Response) => {
            const localFileBuffer = fs.readFileSync(localFilePath)
            expect(res.body).toEqual(localFileBuffer)
          })
      })

      it('テキストファイルをダウンロード', async () => {
        const uploadItem: UploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])

        return request(app.getHttpServer())
          .get(`/storage/${uploadItem.path}`)
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(uploadItem.data)
          })
      })

      it('If-Modified-Sinceの検証', async () => {
        const uploadItem: UploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        }
        const [uploadedFileNode] = await storageService.uploadAsFiles(null, [uploadItem])

        return request(app.getHttpServer())
          .get(`/storage/${uploadItem.path}`)
          .set('If-Modified-Since', uploadedFileNode.updated!.toString())
          .expect(304)
      })

      it('存在しないファイルを指定', async () => {
        const uploadItem: UploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        }

        return request(app.getHttpServer())
          .get(`/storage/${uploadItem.path}`)
          .expect(404)
      })

      it('basePathを指定した場合', async () => {
        const uploadItem: UploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, [uploadItem])

        return request(app.getHttpServer())
          .get(`/storage/${TEST_FILES_DIR}/${uploadItem.path}`)
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(uploadItem.data)
          })
      })
    })
  })

  describe('getDirDescendantDict', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = (await storageService.getDirDescendantDict(null, `${TEST_FILES_DIR}/d1`)).dict

      expect(Object.keys(actual).length).toBe(2)
      expect(actual[`${TEST_FILES_DIR}/d1`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1/fileA.txt`].exists).toBeTruthy()
      await existsNodes(null, Object.values(actual))
    })

    it('ディレクトリは存在しないが、配下ノードは存在する場合', async () => {
      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = (await storageService.getDirDescendantDict(null, `${TEST_FILES_DIR}/d1`)).dict

      expect(Object.keys(actual).length).toBe(2)
      expect(actual[`${TEST_FILES_DIR}/d1`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1/fileA.txt`].exists).toBeTruthy()
      await existsNodes(null, Object.values(actual))
    })

    it('ディレクトリにIDが振られていない場合', async () => {
      // ディレクトリを作成
      const dirs = await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // IDを強制的に未設定にする
      await Promise.all(
        dirs.map(async node => {
          await storageService.saveMetadata(null, node, { id: null })
        })
      )

      const actual = (await storageService.getDirDescendantDict(null, `${TEST_FILES_DIR}/d1`)).dict

      expect(Object.keys(actual).length).toBe(2)
      expect(actual[`${TEST_FILES_DIR}/d1`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1/fileA.txt`].exists).toBeTruthy()
      await existsNodes(null, Object.values(actual))
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const actual = (await storageService.getDirDescendantDict(`${TEST_FILES_DIR}`, `d1`)).dict

      expect(Object.keys(actual).length).toBe(2)
      expect(actual[`d1`].exists).toBeTruthy()
      expect(actual[`d1/fileA.txt`].exists).toBeTruthy()
      await existsNodes(`${TEST_FILES_DIR}`, Object.values(actual))
    })
  })

  describe('getDirChildDict', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

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
          path: `${TEST_FILES_DIR}/d1/d11/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = (await storageService.getDirChildDict(null, `${TEST_FILES_DIR}/d1`)).dict

      expect(Object.keys(actual).length).toBe(3)
      expect(actual[`${TEST_FILES_DIR}/d1`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1/d11`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1/fileA.txt`].exists).toBeTruthy()
      await existsNodes(null, Object.values(actual))
    })

    it('ディレクトリは存在しないが、配下ノードは存在する場合', async () => {
      // ディレクトリを作成せずファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = (await storageService.getDirChildDict(null, `${TEST_FILES_DIR}/d1`)).dict

      expect(Object.keys(actual).length).toBe(3)
      expect(actual[`${TEST_FILES_DIR}/d1`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1/d11`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1/fileA.txt`].exists).toBeTruthy()
      await existsNodes(null, Object.values(actual))
    })

    it('ディレクトリにIDが振られていない場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

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
          path: `${TEST_FILES_DIR}/d1/d11/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // IDを強制的に未設定にする
      const nodeDict = (await storageService.getDirChildDict(null, `${TEST_FILES_DIR}/d1`)).dict
      await Promise.all(
        Object.values(nodeDict).map(async node => {
          await storageService.saveMetadata(null, node, { id: null })
        })
      )

      const actual = (await storageService.getDirChildDict(null, `${TEST_FILES_DIR}/d1`)).dict

      expect(Object.keys(actual).length).toBe(3)
      expect(shortid.isValid(actual[`${TEST_FILES_DIR}/d1`].id)).toBeTruthy()
      expect(shortid.isValid(actual[`${TEST_FILES_DIR}/d1/d11`].id)).toBeTruthy()
      expect(shortid.isValid(actual[`${TEST_FILES_DIR}/d1/fileA.txt`].id)).toBeTruthy()
      await existsNodes(null, Object.values(actual))
    })

    it('存在しないディレクトリを指定した場合', async () => {
      await storageService.createDirs(null, [`${TEST_FILES_DIR}`])

      const actual = (await storageService.getDirChildDict(null, `${TEST_FILES_DIR}/d1`)).dict

      expect(Object.keys(actual).length).toBe(0)
    })

    it(`パスの先頭・末尾に'/'を付与した場合`, async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
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
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const actual = (await storageService.getDirChildDict(`/${TEST_FILES_DIR}/`, `/d1/`)).dict

      expect(Object.keys(actual).length).toBe(3)
      expect(actual[`d1`].exists).toBeTruthy()
      expect(actual[`d1/d11`].exists).toBeTruthy()
      expect(actual[`d1/fileA.txt`].exists).toBeTruthy()
      await existsNodes(`${TEST_FILES_DIR}`, Object.values(actual))
    })

    describe('basePathを指定した場合', () => {
      it('ノードの格納ディレクトリが存在する場合', async () => {
        // ディレクトリを作成
        await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

        // ファイルをアップロード
        const uploadItems: UploadDataItem[] = [
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
        ]
        await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

        const actual = (await storageService.getDirChildDict(`${TEST_FILES_DIR}`, `d1`)).dict

        expect(Object.keys(actual).length).toBe(3)
        expect(actual[`d1`].exists).toBeTruthy()
        expect(actual[`d1/d11`].exists).toBeTruthy()
        expect(actual[`d1/fileA.txt`].exists).toBeTruthy()
        await existsNodes(`${TEST_FILES_DIR}`, Object.values(actual))
      })

      it('ノードの格納ディレクトリが存在しない場合', async () => {
        // ディレクトリを作成せずファイルをアップロード
        const uploadItems: UploadDataItem[] = [
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
        ]
        await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

        const actual = (await storageService.getDirChildDict(`${TEST_FILES_DIR}`, `d1`)).dict

        expect(Object.keys(actual).length).toBe(3)
        expect(actual[`d1`].exists).toBeTruthy()
        expect(actual[`d1/d11`].exists).toBeTruthy()
        expect(actual[`d1/fileA.txt`].exists).toBeTruthy()
        await existsNodes(`${TEST_FILES_DIR}`, Object.values(actual))
      })

      it('dirPathを指定しない場合', async () => {
        // ディレクトリを作成
        await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11`, `d2/d21`])

        const actual = (await storageService.getDirChildDict(`${TEST_FILES_DIR}`)).dict

        expect(Object.keys(actual).length).toBe(2)
        expect(actual[`d1`].exists).toBeTruthy()
        expect(actual[`d2`].exists).toBeTruthy()
        await existsNodes(`${TEST_FILES_DIR}`, Object.values(actual))
      })
    })
  })

  describe('getChildDict', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

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
          path: `${TEST_FILES_DIR}/d1/d11/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = (await storageService.getChildDict(null, `${TEST_FILES_DIR}/d1`)).dict

      expect(Object.keys(actual).length).toBe(2)
      expect(actual[`${TEST_FILES_DIR}/d1/d11`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1/fileA.txt`].exists).toBeTruthy()
      await existsNodes(null, Object.values(actual))
    })
  })

  describe('getDescendantDict', () => {
    it('ノードの格納ディレクトリが存在する場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
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
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = (await storageService.getDescendantDict(null, `${TEST_FILES_DIR}/d1`)).dict

      expect(Object.keys(actual).length).toBe(3)
      expect(actual[`${TEST_FILES_DIR}/d1/d11`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1/d11/fileA.txt`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1/d11/fileB.txt`].exists).toBeTruthy()
      await existsNodes(null, Object.values(actual))
    })

    it('ノードの格納ディレクトリが存在しない場合', async () => {
      // ディレクトリを作成せずファイルをアップロード
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
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = (await storageService.getDescendantDict(null, `${TEST_FILES_DIR}/d1`)).dict

      expect(Object.keys(actual).length).toBe(3)
      expect(actual[`${TEST_FILES_DIR}/d1/d11`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1/d11/fileA.txt`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1/d11/fileB.txt`].exists).toBeTruthy()
      await existsNodes(null, Object.values(actual))
    })

    it('ノードにIDが振られていない場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
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
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // IDを強制的に未設定にする
      storageService.getDescendantDict(null, `${TEST_FILES_DIR}/d1`).then(async ({ dict }) => {
        await Promise.all(
          Object.values(dict).map(async node => {
            await storageService.saveMetadata(null, node, { id: null })
          })
        )
      })

      const actual = (await storageService.getDescendantDict(null, `${TEST_FILES_DIR}/d1`)).dict

      expect(Object.keys(actual).length).toBe(3)
      expect(shortid.isValid(actual[`${TEST_FILES_DIR}/d1/d11`].id)).toBeTruthy()
      expect(shortid.isValid(actual[`${TEST_FILES_DIR}/d1/d11/fileA.txt`].id)).toBeTruthy()
      expect(shortid.isValid(actual[`${TEST_FILES_DIR}/d1/d11/fileB.txt`].id)).toBeTruthy()
      await existsNodes(null, Object.values(actual))
    })

    it('存在しないディレクトリを指定した場合', async () => {
      await storageService.createDirs(null, [`${TEST_FILES_DIR}`])

      const actual = (await storageService.getDescendantDict(null, `${TEST_FILES_DIR}/d1`)).dict

      expect(Object.keys(actual).length).toBe(0)
    })

    it(`パスの先頭・末尾に'/'を付与した場合`, async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // パスの先頭・末尾に'/'を付与
      const actual = (await storageService.getDescendantDict(`/${TEST_FILES_DIR}/`, `/d1/`)).dict

      expect(Object.keys(actual).length).toBe(1)
      expect(actual[`d1/fileA.txt`].exists).toBeTruthy()
      await existsNodes(`${TEST_FILES_DIR}`, Object.values(actual))
    })

    it('大量データの場合', async () => {
      // ディレクトリを作成せずファイルをアップロード
      const uploadItems: UploadDataItem[] = []
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
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 大量データを想定して分割読み込みを行う
      const nodeDict: { [path: string]: GCSStorageNode } = {}
      let nodeData = await storageService.getDescendantDict(`${TEST_FILES_DIR}`, `d1`, { maxResults: 3 })
      Object.assign(nodeDict, nodeData.dict)
      while (nodeData.nextPageToken) {
        nodeData = await storageService.getDescendantDict(`${TEST_FILES_DIR}`, `d1`, {
          pageToken: nodeData.nextPageToken,
          maxResults: 3,
        })
        Object.assign(nodeDict, nodeData.dict)
      }

      expect(Object.keys(nodeDict).length).toBe(13)
      expect(nodeDict[`d1/d11`].exists).toBe(true)
      expect(nodeDict[`d1/d11/d111`].exists).toBe(true)
      expect(nodeDict[`d1/d11/d111/file01.txt`].exists).toBe(true)
      expect(nodeDict[`d1/d11/d111/file02.txt`].exists).toBe(true)
      expect(nodeDict[`d1/d11/d111/file03.txt`].exists).toBe(true)
      expect(nodeDict[`d1/d11/d111/file04.txt`].exists).toBe(true)
      expect(nodeDict[`d1/d11/d111/file05.txt`].exists).toBe(true)
      expect(nodeDict[`d1/d12`].exists).toBe(true)
      expect(nodeDict[`d1/d12/file06.txt`].exists).toBe(true)
      expect(nodeDict[`d1/d12/file07.txt`].exists).toBe(true)
      expect(nodeDict[`d1/d12/file08.txt`].exists).toBe(true)
      expect(nodeDict[`d1/d12/file09.txt`].exists).toBe(true)
      expect(nodeDict[`d1/d12/file10.txt`].exists).toBe(true)
      await existsNodes(`${TEST_FILES_DIR}`, Object.values(nodeDict))
    })

    describe('basePathを指定した場合', () => {
      it('ノードの格納ディレクトリが存在する場合', async () => {
        // ディレクトリを作成
        await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

        // ファイルをアップロード
        const uploadItems: UploadDataItem[] = [
          {
            data: 'testA',
            contentType: 'text/plain; charset=utf-8',
            path: `d1/d11/fileA.txt`,
          },
          {
            data: 'testB',
            contentType: 'text/plain; charset=utf-8',
            path: `d1/d11/fileB.txt`,
          },
        ]
        await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

        const actual = (await storageService.getDescendantDict(`${TEST_FILES_DIR}`, `d1`)).dict

        expect(Object.keys(actual).length).toBe(3)
        expect(actual[`d1/d11`].exists).toBeTruthy()
        expect(actual[`d1/d11/fileA.txt`].exists).toBeTruthy()
        expect(actual[`d1/d11/fileB.txt`].exists).toBeTruthy()
        await existsNodes(`${TEST_FILES_DIR}`, Object.values(actual))
      })

      it('ノードの格納ディレクトリが存在しない場合', async () => {
        // ディレクトリを作成せずファイルをアップロード
        const uploadItems: UploadDataItem[] = [
          {
            data: 'testA',
            contentType: 'text/plain; charset=utf-8',
            path: `d1/d11/fileA.txt`,
          },
          {
            data: 'testB',
            contentType: 'text/plain; charset=utf-8',
            path: `d1/d11/fileB.txt`,
          },
        ]
        await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

        const actual = (await storageService.getDescendantDict(`${TEST_FILES_DIR}`, `d1`)).dict

        expect(Object.keys(actual).length).toBe(3)
        expect(actual[`d1/d11`].exists).toBeTruthy()
        expect(actual[`d1/d11/fileA.txt`].exists).toBeTruthy()
        expect(actual[`d1/d11/fileB.txt`].exists).toBeTruthy()
        await existsNodes(`${TEST_FILES_DIR}`, Object.values(actual))
      })

      it('dirPathを指定しない場合', async () => {
        // ディレクトリを作成
        await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

        // ファイルをアップロード
        const uploadItems: UploadDataItem[] = [
          {
            data: 'testA',
            contentType: 'text/plain; charset=utf-8',
            path: `d1/d11/fileA.txt`,
          },
        ]
        await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

        const actual = (await storageService.getDescendantDict(`${TEST_FILES_DIR}`)).dict

        expect(Object.keys(actual).length).toBe(3)
        expect(actual[`d1`].exists).toBeTruthy()
        expect(actual[`d1/d11`].exists).toBeTruthy()
        expect(actual[`d1/d11/fileA.txt`].exists).toBeTruthy()
        await existsNodes(`${TEST_FILES_DIR}`, Object.values(actual))
      })
    })
  })

  describe('saveDirNode', () => {
    it('ベーシックケース', async () => {
      const d1 = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)
      const d1_gcsNode = d1.gcsNode
      expect(d1.exists).toBeFalsy()
      expect(d1.share).toEqual(EMPTY_SHARE_SETTINGS)

      const actual = await storageService.saveDirNode(null, d1, { share: { isPublic: true, uids: ['ichiro'] } })

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.share).toEqual({ isPublic: true, uids: ['ichiro'] } as StorageNodeShareSettings)
      expect(actual.exists).toBeTruthy()
      expect(actual.gcsNode).toBe(d1_gcsNode)
      await existsNodes(null, [actual])
    })

    it('メタデータを指定しない場合', async () => {
      const d1 = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)
      const d1_gcsNode = d1.gcsNode
      expect(d1.exists).toBeFalsy()
      expect(d1.share).toEqual(EMPTY_SHARE_SETTINGS)

      const actual = await storageService.saveDirNode(null, d1)

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.share).toEqual(EMPTY_SHARE_SETTINGS)
      expect(actual.exists).toBeTruthy()
      expect(actual.gcsNode).toBe(d1_gcsNode)
      await existsNodes(null, [actual])
    })

    it('既に存在するノードの保存を行った場合', async () => {
      const d1 = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)

      // saveDirNode()を実行
      Object.assign(d1, await storageService.saveDirNode(null, d1))
      const id = d1.id
      const d1_gcsNode = d1.gcsNode
      expect(shortid.isValid(d1.id)).toBeTruthy()
      expect(d1.exists).toBeTruthy()
      expect(d1.share).toEqual(EMPTY_SHARE_SETTINGS)

      // saveDirNode()を再度実行する
      const actual = await storageService.saveDirNode(null, d1, { share: { isPublic: true, uids: ['ichiro'] } })

      expect(actual.id).toBe(id)
      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.share).toEqual({ isPublic: true, uids: ['ichiro'] } as StorageNodeShareSettings)
      expect(actual.exists).toBeTruthy()
      expect(actual.gcsNode).toBe(d1_gcsNode)
      await existsNodes(null, [actual])
    })

    it('ファイルを指定した場合', async () => {
      const fileA = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/fileA.txt`)

      let actual!: Error
      try {
        await storageService.saveDirNode(null, fileA)
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The specified node is not directory: { path: '${fileA.path}', nodeType: '${fileA.nodeType}' }`)
    })

    it('basePathを指定した場合', async () => {
      const d1 = await storageService.getRealDirNode(`${TEST_FILES_DIR}`, `d1`)
      const d1_gcsNode = d1.gcsNode
      expect(d1.exists).toBeFalsy()
      expect(d1.share).toEqual(EMPTY_SHARE_SETTINGS)

      const actual = await storageService.saveDirNode(`${TEST_FILES_DIR}`, d1)

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.path).toBe(`d1`)
      expect(actual.share).toEqual(EMPTY_SHARE_SETTINGS)
      expect(actual.exists).toBeTruthy()
      expect(actual.gcsNode).toBe(d1_gcsNode)
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })

    it(`パスの先頭・末尾に'/'を付与した場合`, async () => {
      const d1 = await storageService.getRealDirNode(`${TEST_FILES_DIR}`, `d1`)
      const d1_gcsNode = d1.gcsNode
      expect(d1.exists).toBeFalsy()
      expect(d1.share).toEqual(EMPTY_SHARE_SETTINGS)

      const actual = await storageService.saveDirNode(`/${TEST_FILES_DIR}/`, d1)

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.path).toBe(`d1`)
      expect(actual.share).toEqual(EMPTY_SHARE_SETTINGS)
      expect(actual.exists).toBeTruthy()
      expect(actual.gcsNode).toBe(d1_gcsNode)
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })
  })

  describe('saveFileNode', () => {
    it('ベーシックケース', async () => {
      const fileA = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/fileA.txt`)
      const fileA_gcsNode = fileA.gcsNode
      expect(fileA.exists).toBeFalsy()
      expect(fileA.share).toEqual(EMPTY_SHARE_SETTINGS)

      const actual = await storageService.saveFileNode(
        null,
        fileA,
        'testA',
        { contentType: 'text/plain; charset=utf-8' },
        { share: { isPublic: true, uids: ['ichiro'] } }
      )
      const [buffer] = await actual.gcsNode.download()
      const fileA_content = buffer.toString('utf-8')

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.path).toBe(`${TEST_FILES_DIR}/fileA.txt`)
      expect(actual.share).toEqual({ isPublic: true, uids: ['ichiro'] })
      expect(actual.gcsNode).toBe(fileA_gcsNode)
      expect(fileA_content).toBe('testA')
      await existsNodes(null, [actual])
    })

    it('メタデータを指定しない場合', async () => {
      const fileA = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/fileA.txt`)
      const fileA_gcsNode = fileA.gcsNode
      expect(fileA.exists).toBeFalsy()
      expect(fileA.share).toEqual(EMPTY_SHARE_SETTINGS)

      const actual = await storageService.saveFileNode(null, fileA, 'testA', { contentType: 'text/plain; charset=utf-8' })
      const [buffer] = await actual.gcsNode.download()
      const fileA_content = buffer.toString('utf-8')

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.path).toBe(`${TEST_FILES_DIR}/fileA.txt`)
      expect(actual.share).toEqual(EMPTY_SHARE_SETTINGS)
      expect(actual.gcsNode).toBe(fileA_gcsNode)
      expect(fileA_content).toBe('testA')
      await existsNodes(null, [actual])
    })

    it('既に存在するノードの保存を行った場合', async () => {
      const fileA = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/fileA.txt`)

      // saveDirNode()を実行
      Object.assign(fileA, await storageService.saveFileNode(null, fileA, 'testA-1', { contentType: 'text/plain; charset=utf-8' }))
      const id = fileA.id
      const d1_gcsNode = fileA.gcsNode
      expect(shortid.isValid(fileA.id)).toBeTruthy()
      expect(fileA.exists).toBeTruthy()
      expect(fileA.share).toEqual(EMPTY_SHARE_SETTINGS)

      // saveDirNode()を再度実行する
      const actual = await storageService.saveFileNode(
        null,
        fileA,
        'testA-2',
        { contentType: 'text/plain; charset=utf-8' },
        { share: { isPublic: true, uids: ['ichiro'] } }
      )
      const [buffer] = await actual.gcsNode.download()
      const fileA_content = buffer.toString('utf-8')

      expect(actual.id).toBe(id)
      expect(actual.path).toBe(`${TEST_FILES_DIR}/fileA.txt`)
      expect(actual.share).toEqual({ isPublic: true, uids: ['ichiro'] })
      expect(actual.exists).toBeTruthy()
      expect(actual.gcsNode).toBe(d1_gcsNode)
      expect(fileA_content).toBe('testA-2')
      await existsNodes(null, [actual])
    })

    it('ディレクトリを指定した場合', async () => {
      const d1 = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)

      let actual!: Error
      try {
        await storageService.saveFileNode(null, d1, 'testA', { contentType: 'text/plain; charset=utf-8' })
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The specified node is not file: { path: '${d1.path}', nodeType: '${d1.nodeType}' }`)
    })

    it('basePathを指定した場合', async () => {
      const fileA = await storageService.getRealFileNode(`${TEST_FILES_DIR}`, `fileA.txt`)
      const fileA_gcsNode = fileA.gcsNode
      expect(fileA.exists).toBeFalsy()
      expect(fileA.share).toEqual(EMPTY_SHARE_SETTINGS)

      const actual = await storageService.saveFileNode(`${TEST_FILES_DIR}`, fileA, 'testA', { contentType: 'text/plain; charset=utf-8' })
      const [buffer] = await actual.gcsNode.download()
      const fileA_content = buffer.toString('utf-8')

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.path).toBe(`fileA.txt`)
      expect(actual.share).toEqual(EMPTY_SHARE_SETTINGS)
      expect(actual.gcsNode).toBe(fileA_gcsNode)
      expect(fileA_content).toBe('testA')
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })

    it(`パスの先頭・末尾に'/'を付与した場合`, async () => {
      const fileA = await storageService.getRealFileNode(`${TEST_FILES_DIR}`, `fileA.txt`)
      const fileA_gcsNode = fileA.gcsNode
      expect(fileA.exists).toBeFalsy()
      expect(fileA.share).toEqual(EMPTY_SHARE_SETTINGS)

      const actual = await storageService.saveFileNode(`/${TEST_FILES_DIR}/`, fileA, 'testA', { contentType: 'text/plain; charset=utf-8' })
      const [buffer] = await actual.gcsNode.download()
      const fileA_content = buffer.toString('utf-8')

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.path).toBe(`fileA.txt`)
      expect(actual.share).toEqual(EMPTY_SHARE_SETTINGS)
      expect(actual.gcsNode).toBe(fileA_gcsNode)
      expect(fileA_content).toBe('testA')
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })
  })

  describe('toStorageNode', () => {
    it('ディレクトリノードの変換 - 存在しないディレクトリ', async () => {
      const d1 = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)

      const actual = storageService.toStorageNode(null, d1.gcsNode)

      expect(actual.id).toBe('')
      expect(actual.nodeType).toBe(StorageNodeType.Dir)
      expect(actual.name).toBe(`d1`)
      expect(actual.dir).toBe(`${TEST_FILES_DIR}`)
      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.contentType).toBe('')
      expect(actual.size).toBe(0)
      expect(actual.share).toEqual(EMPTY_SHARE_SETTINGS)
      expect(dayjs(actual.created).isValid()).toBeTruthy()
      expect(dayjs(actual.updated).isValid()).toBeTruthy()
      expect(actual.exists).toBeFalsy()
      expect(actual.gcsNode).toBeDefined()
    })

    it('ディレクトリノードの変換 - 存在するディレクトリ', async () => {
      const d1 = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)
      Object.assign(d1, await storageService.saveDirNode(null, d1, { share: { isPublic: true, uids: ['ichiro'] } }))

      const actual = storageService.toStorageNode(null, d1.gcsNode)

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.nodeType).toBe(StorageNodeType.Dir)
      expect(actual.name).toBe(`d1`)
      expect(actual.dir).toBe(`${TEST_FILES_DIR}`)
      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.contentType).toBe('')
      expect(actual.size).toBe(0)
      expect(actual.share).toEqual({ isPublic: true, uids: ['ichiro'] })
      expect(dayjs(actual.created).isValid()).toBeTruthy()
      expect(dayjs(actual.updated).isValid()).toBeTruthy()
      expect(actual.exists).toBeFalsy()
      expect(actual.gcsNode).toBeDefined()
    })

    it('ファイルノードの変換 - 存在しないファイル', async () => {
      const fileA = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)

      const actual = storageService.toStorageNode(null, fileA.gcsNode)

      expect(actual.id).toBe('')
      expect(actual.nodeType).toBe(StorageNodeType.File)
      expect(actual.name).toBe(`fileA.txt`)
      expect(actual.dir).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(actual.contentType).toBe('')
      expect(actual.size).toBe(0)
      expect(actual.share).toEqual(EMPTY_SHARE_SETTINGS)
      expect(dayjs(actual.created).isValid()).toBeTruthy()
      expect(dayjs(actual.updated).isValid()).toBeTruthy()
      expect(actual.exists).toBeFalsy()
      expect(actual.gcsNode).toBeDefined()
    })

    it('ファイルノードの変換 - 存在するディレクトリ', async () => {
      const fileA = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)
      Object.assign(
        fileA,
        await storageService.saveFileNode(
          null,
          fileA,
          'testA',
          { contentType: 'text/plain; charset=utf-8' },
          { share: { isPublic: true, uids: ['ichiro'] } }
        )
      )

      const actual = storageService.toStorageNode(null, fileA.gcsNode)

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.nodeType).toBe(StorageNodeType.File)
      expect(actual.name).toBe(`fileA.txt`)
      expect(actual.dir).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(actual.contentType).toBe('text/plain; charset=utf-8')
      expect(actual.size).toBeGreaterThan(0)
      expect(actual.share).toEqual({ isPublic: true, uids: ['ichiro'] })
      expect(dayjs(actual.created).isValid()).toBeTruthy()
      expect(dayjs(actual.updated).isValid()).toBeTruthy()
      expect(actual.exists).toBeFalsy()
      expect(actual.gcsNode).toBeDefined()
    })

    it('basePathを指定した場合', async () => {
      const fileA = await storageService.getRealFileNode(`${TEST_FILES_DIR}`, `d1/fileA.txt`)

      const actual = storageService.toStorageNode(`${TEST_FILES_DIR}`, fileA.gcsNode)

      expect(actual.id).toBe('')
      expect(actual.nodeType).toBe(StorageNodeType.File)
      expect(actual.name).toBe(`fileA.txt`)
      expect(actual.dir).toBe(`d1`)
      expect(actual.path).toBe(`d1/fileA.txt`)
      expect(actual.contentType).toBe('')
      expect(actual.size).toBe(0)
      expect(actual.share).toEqual(EMPTY_SHARE_SETTINGS)
      expect(dayjs(actual.created).isValid()).toBeTruthy()
      expect(dayjs(actual.updated).isValid()).toBeTruthy()
      expect(actual.exists).toBeFalsy()
      expect(actual.gcsNode).toBeDefined()
    })
  })

  describe('sortStorageNodes', () => {
    it('昇順でソート', async () => {
      const d1: StorageNode = {
        id: shortid.generate(),
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
        id: shortid.generate(),
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
        id: shortid.generate(),
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
        id: shortid.generate(),
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
        id: shortid.generate(),
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
        id: shortid.generate(),
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
        id: shortid.generate(),
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
        id: shortid.generate(),
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
        id: shortid.generate(),
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

  describe('padVirtualDirNodes', () => {
    it('topPathを指定しない場合', async () => {
      // ディレクトリを作成
      const dirs = await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // ファイルのアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d2/d21/fileB.txt`,
        },
        {
          data: 'testC',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/fileC.txt`,
        },
      ]
      const files = await storageService.uploadAsFiles(null, uploadItems)

      // 歯抜け状態のノードマップを取得
      const nodeDict = [...dirs, ...files].reduce((result, node) => {
        result[node.path] = node
        return result
      }, {} as { [path: string]: GCSStorageNode })

      // ノードマップの歯抜けノードを取得 - topPathを指定しない
      const actual = await storageService.padVirtualDirNodes(null, nodeDict, null)

      expect(Object.keys(actual).length).toBe(2)
      const d2 = actual[`${TEST_FILES_DIR}/d2`]
      expect(d2.path).toBe(`${TEST_FILES_DIR}/d2`)
      expect(d2.exists).toBeFalsy()
      expect(d2.gcsNode.name).toBe(`${TEST_FILES_DIR}/d2/`)
      const d21 = actual[`${TEST_FILES_DIR}/d2/d21`]
      expect(d21.path).toBe(`${TEST_FILES_DIR}/d2/d21`)
      expect(d21.exists).toBeFalsy()
      expect(d21.gcsNode.name).toBe(`${TEST_FILES_DIR}/d2/d21/`)
    })

    it('topPathを指定した場合 - topPathノードが存在する - 配下にノードが存在する', async () => {
      // ディレクトリを作成
      const dirs = await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // ファイルのアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      const files = await storageService.uploadAsFiles(null, uploadItems)

      // 歯抜け状態のノードマップを取得
      const nodeDict = [...dirs, ...files].reduce((result, node) => {
        result[node.path] = node
        return result
      }, {} as { [path: string]: GCSStorageNode })

      // ノードマップの歯抜けノードを取得 - topPathを指定
      const actual = await storageService.padVirtualDirNodes(null, nodeDict, `${TEST_FILES_DIR}/d1`)

      expect(Object.keys(actual).length).toBe(1)
      const d11 = actual[`${TEST_FILES_DIR}/d1/d11`]
      expect(d11.path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(d11.exists).toBeFalsy()
      expect(d11.gcsNode.name).toBe(`${TEST_FILES_DIR}/d1/d11/`)
    })

    it('topPathを指定した場合 - topPathノードが存在する - 配下にノードが存在しない', async () => {
      // ディレクトリを作成
      const dirs = await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // 歯抜け状態のノードマップを取得
      const nodeDict = [...dirs].reduce((result, node) => {
        result[node.path] = node
        return result
      }, {} as { [path: string]: GCSStorageNode })

      // ノードマップの歯抜けノードを取得 - topPathを指定
      const actual = await storageService.padVirtualDirNodes(null, nodeDict, `${TEST_FILES_DIR}/d1`)

      expect(Object.keys(actual).length).toBe(0)
    })

    it('topPathを指定した場合 - topPathノードが存在しない - 配下にノードが存在しない', async () => {
      // ノードマップの歯抜けノードを取得 - topPathを指定
      const actual = await storageService.padVirtualDirNodes(null, {}, `${TEST_FILES_DIR}/d1`)

      expect(Object.keys(actual).length).toBe(1)
      const d1 = actual[`${TEST_FILES_DIR}/d1`]
      expect(d1.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(d1.exists).toBeFalsy()
      expect(d1.gcsNode.name).toBe(`${TEST_FILES_DIR}/d1/`)
    })

    it('topPathを指定した場合 - topPathノードが存在しない - 配下にノードが存在する', async () => {
      // ファイルのアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      const files = await storageService.uploadAsFiles(null, uploadItems)

      // 歯抜け状態のノードマップを取得
      const nodeDict = [...files].reduce((result, node) => {
        result[node.path] = node
        return result
      }, {} as { [path: string]: GCSStorageNode })

      // ノードマップの歯抜けノードを取得 - topPathを指定
      const actual = await storageService.padVirtualDirNodes(null, nodeDict, `${TEST_FILES_DIR}/d1`)

      expect(Object.keys(actual).length).toBe(2)
      const d1 = actual[`${TEST_FILES_DIR}/d1`]
      expect(d1.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(d1.exists).toBeFalsy()
      expect(d1.gcsNode.name).toBe(`${TEST_FILES_DIR}/d1/`)
      const d11 = actual[`${TEST_FILES_DIR}/d1/d11`]
      expect(d11.path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(d11.exists).toBeFalsy()
      expect(d11.gcsNode.name).toBe(`${TEST_FILES_DIR}/d1/d11/`)
    })

    it('basePathを指定した場合 - topPathを指定しない', async () => {
      // ディレクトリを作成
      const dirs = await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

      // ファイルのアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ]
      const files = await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 歯抜け状態のノードマップを取得
      const nodeDict = [...dirs, ...files].reduce((result, node) => {
        result[node.path] = node
        return result
      }, {} as { [path: string]: GCSStorageNode })

      // ノードマップの歯抜けノードを取得 - bsePathを指定 - topPathを指定しない
      const actual = await storageService.padVirtualDirNodes(`${TEST_FILES_DIR}`, nodeDict, null)

      expect(Object.keys(actual).length).toBe(1)
      const d11 = actual[`d1/d11`]
      expect(d11.path).toBe(`d1/d11`)
      expect(d11.exists).toBeFalsy()
      expect(d11.gcsNode.name).toBe(`${TEST_FILES_DIR}/d1/d11/`)
    })

    it('basePathを指定した場合 - topPathを指定する', async () => {
      // ディレクトリを作成
      const dirs = await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

      // ファイルのアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ]
      const files = await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 歯抜け状態のノードマップを取得
      const nodeDict = [...dirs, ...files].reduce((result, node) => {
        result[node.path] = node
        return result
      }, {} as { [path: string]: GCSStorageNode })

      // ノードマップの歯抜けノードを取得 - basePathを指定 - topPathを指定
      const actual = await storageService.padVirtualDirNodes(`${TEST_FILES_DIR}`, nodeDict, `d1`)

      expect(Object.keys(actual).length).toBe(1)
      const d11 = actual[`d1/d11`]
      expect(d11.path).toBe(`d1/d11`)
      expect(d11.exists).toBeFalsy()
      expect(d11.gcsNode.name).toBe(`${TEST_FILES_DIR}/d1/d11/`)
    })

    it(`パスの先頭・末尾に'/'を付与`, async () => {
      // ディレクトリを作成
      const dirs = await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

      // ファイルのアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ]
      const files = await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 歯抜け状態のノードマップを取得
      const nodeDict = [...dirs, ...files].reduce((result, node) => {
        result[node.path] = node
        return result
      }, {} as { [path: string]: GCSStorageNode })

      // ノードマップの歯抜けノードを取得 - パスの先頭・末尾に'/'を付与
      const actual = await storageService.padVirtualDirNodes(`/${TEST_FILES_DIR}/`, nodeDict, `/d1/`)

      expect(Object.keys(actual).length).toBe(1)
      const d11 = actual[`d1/d11`]
      expect(d11.path).toBe(`d1/d11`)
      expect(d11.exists).toBeFalsy()
      expect(d11.gcsNode.name).toBe(`${TEST_FILES_DIR}/d1/d11/`)
    })
  })

  describe('padRealDirNodes', () => {
    it('topPathを指定しない場合', async () => {
      // 存在しないディレクトリを取得
      const dirs = [await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)]

      // ファイルのアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      const files = await storageService.uploadAsFiles(null, uploadItems)

      // 歯抜け状態のノードマップを取得
      // 'd1', 'd1/d11/fileA.txt'
      const nodeDict = [...dirs, ...files].reduce((result, node) => {
        result[node.path] = node
        return result
      }, {} as { [path: string]: GCSStorageNode })

      // ノードマップの歯抜けノードを穴埋め - topPathを指定しない
      const actual = await storageService.padRealDirNodes(null, nodeDict, null)

      expect(Object.keys(actual).length).toBe(4)
      expect(actual[`${TEST_FILES_DIR}`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1/d11`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1/d11/fileA.txt`].exists).toBeTruthy()
      await existsNodes(null, Object.values(actual))
    })

    it('topPathを指定した場合', async () => {
      // 存在しないディレクトリを取得
      const dirs = [await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)]

      // ファイルのアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      const files = await storageService.uploadAsFiles(null, uploadItems)

      // 歯抜け状態のノードマップを取得
      // 'd1', 'd1/d11/fileA.txt'
      const nodeDict = [...dirs, ...files].reduce((result, node) => {
        result[node.path] = node
        return result
      }, {} as { [path: string]: GCSStorageNode })

      // ノードマップの歯抜けノードを穴埋め - topPathを指定
      const actual = await storageService.padRealDirNodes(null, nodeDict, `${TEST_FILES_DIR}/d1`)

      expect(Object.keys(actual).length).toBe(3)
      expect(actual[`${TEST_FILES_DIR}/d1`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1/d11`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1/d11/fileA.txt`].exists).toBeTruthy()
      await existsNodes(null, Object.values(actual))
    })

    it('basePathを指定した場合', async () => {
      // 存在しないディレクトリを取得
      const dirs = [await storageService.getRealDirNode(`${TEST_FILES_DIR}`, `d1`)]

      // ファイルのアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ]
      const files = await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 歯抜け状態のノードマップを取得
      // 'd1', 'd1/d11/fileA.txt'
      const nodeDict = [...dirs, ...files].reduce((result, node) => {
        result[node.path] = node
        return result
      }, {} as { [path: string]: GCSStorageNode })

      // ノードマップの歯抜けノードを穴埋め - topPathを指定
      const actual = await storageService.padRealDirNodes(`${TEST_FILES_DIR}`, nodeDict, `d1`)

      expect(Object.keys(actual).length).toBe(3)
      expect(actual[`d1`].exists).toBeTruthy()
      expect(actual[`d1/d11`].exists).toBeTruthy()
      expect(actual[`d1/d11/fileA.txt`].exists).toBeTruthy()
      await existsNodes(`${TEST_FILES_DIR}`, Object.values(actual))
    })
  })

  describe('getHierarchicalNodeDict', () => {
    it('ベーシックケース - 引数にファイルを指定', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11/d111`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/d111/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = await storageService.getHierarchicalNodeDict(null, `${TEST_FILES_DIR}/d1/d11/d111/fileA.txt`)

      expect(Object.keys(actual).length).toBe(5)
      expect(actual[`${TEST_FILES_DIR}`]).toBeDefined()
      expect(actual[`${TEST_FILES_DIR}/d1`]).toBeDefined()
      expect(actual[`${TEST_FILES_DIR}/d1/d11`]).toBeDefined()
      expect(actual[`${TEST_FILES_DIR}/d1/d11/d111`]).toBeDefined()
      expect(actual[`${TEST_FILES_DIR}/d1/d11/d111/fileA.txt`]).toBeDefined()
      await existsNodes(null, Object.values(actual))
    })

    it('ベーシックケース - 引数にディレクトリを指定', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11/d111`])

      const actual = await storageService.getHierarchicalNodeDict(null, `${TEST_FILES_DIR}/d1/d11/d111`)

      expect(Object.keys(actual).length).toBe(4)
      expect(actual[`${TEST_FILES_DIR}`]).toBeDefined()
      expect(actual[`${TEST_FILES_DIR}/d1`]).toBeDefined()
      expect(actual[`${TEST_FILES_DIR}/d1/d11`]).toBeDefined()
      await existsNodes(null, Object.values(actual))
    })

    it('階層構造の形成に必要なディレクトリが欠けている場合', async () => {
      // ディレクトリを作成せずファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/d111/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = await storageService.getHierarchicalNodeDict(null, `${TEST_FILES_DIR}/d1/d11/d111/fileA.txt`)

      expect(Object.keys(actual).length).toBe(5)
      expect(actual[`${TEST_FILES_DIR}`]).toBeDefined()
      expect(actual[`${TEST_FILES_DIR}/d1`]).toBeDefined()
      expect(actual[`${TEST_FILES_DIR}/d1/d11`]).toBeDefined()
      expect(actual[`${TEST_FILES_DIR}/d1/d11/d111`]).toBeDefined()
      expect(actual[`${TEST_FILES_DIR}/d1/d11/d111/fileA.txt`]).toBeDefined()
      await existsNodes(null, Object.values(actual))
    })

    it('引数ノードが存在しない場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`])

      const actual = await storageService.getHierarchicalNodeDict(null, `${TEST_FILES_DIR}/d1/d11/d111/fileA.txt`)

      // 実際に存在する祖先ノードが取得される
      expect(Object.keys(actual).length).toBe(3)
      expect(actual[`${TEST_FILES_DIR}`]).toBeDefined()
      expect(actual[`${TEST_FILES_DIR}/d1`]).toBeDefined()
      expect(actual[`${TEST_FILES_DIR}/d1/d11`]).toBeDefined()
      await existsNodes(null, Object.values(actual))
    })

    it(`パスの先頭・末尾に'/'を付与`, async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11/d111`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/d111/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const actual = await storageService.getHierarchicalNodeDict(`/${TEST_FILES_DIR}/`, `/d1/d11/d111/fileA.txt/`)

      expect(Object.keys(actual).length).toBe(4)
      expect(actual[`d1`]).toBeDefined()
      expect(actual[`d1/d11`]).toBeDefined()
      expect(actual[`d1/d11/d111`]).toBeDefined()
      expect(actual[`d1/d11/d111/fileA.txt`]).toBeDefined()
      await existsNodes(`${TEST_FILES_DIR}`, Object.values(actual))
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11/d111`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/d111/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const actual = await storageService.getHierarchicalNodeDict(`${TEST_FILES_DIR}`, `d1/d11/d111/fileA.txt`)

      expect(Object.keys(actual).length).toBe(4)
      expect(actual[`d1`]).toBeDefined()
      expect(actual[`d1/d11`]).toBeDefined()
      expect(actual[`d1/d11/d111`]).toBeDefined()
      expect(actual[`d1/d11/d111/fileA.txt`]).toBeDefined()
      await existsNodes(`${TEST_FILES_DIR}`, Object.values(actual))
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
