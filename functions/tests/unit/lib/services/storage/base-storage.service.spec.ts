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
  StorageNodeShareSettingsInput,
  StorageNodeType,
  UploadDataItem,
} from '../../../../../src/lib'
import { Test, TestingModule } from '@nestjs/testing'
import { MockBaseAppModule } from '../../../../mocks/lib'
import { Module } from '@nestjs/common'
import { Response } from 'supertest'
import { config } from '../../../../../src/lib/base'
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
  isPublic: false,
  uids: [],
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
  getDirDescendantMap: LibStorageService['getDirDescendantMap']
  getDescendantMap: LibStorageService['getDescendantMap']
  getDirChildMap: LibStorageService['getDirChildMap']
  getChildMap: LibStorageService['getChildMap']
  toStorageNode: LibStorageService['toStorageNode']
  sortStorageNodes: LibStorageService['sortStorageNodes']
  padVirtualDirNodes: LibStorageService['padVirtualDirNodes']
  padRealDirNodes: LibStorageService['padRealDirNodes']
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
    const exists = (await gcsNode.exists())[0]
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
        promises.push(storageService.getDirNode(basePath, node.path))
        break
      case StorageNodeType.File:
        promises.push(storageService.getFileNode(basePath, node.path))
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
    await sleep(2000)
  })

  describe('getHierarchicalDescendants', () => {
    it('ノードの格納ディレクトリが存在する場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = await storageService.getHierarchicalDescendants(null, `${TEST_FILES_DIR}/d1/d11`)

      expect(actual.length).toBe(4)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
      await existsNodes(null, actual)
    })

    it('ノードの格納ディレクトリが存在しない場合', async () => {
      // ディレクトリを作成せずファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = await storageService.getHierarchicalDescendants(null, `${TEST_FILES_DIR}/d1/d11`)

      expect(actual.length).toBe(4)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
      await existsNodes(null, actual)
    })

    it('ノードにIDが振られていない場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // IDを強制的に未設定にする
      const nodes = await storageService.getHierarchicalDescendants(null, `${TEST_FILES_DIR}/d1/d11`)
      await Promise.all(
        nodes.map(async node => {
          await storageService.saveMetadata(null, node, { id: null })
        })
      )

      const actual = await storageService.getHierarchicalDescendants(null, `${TEST_FILES_DIR}/d1/d11`)

      expect(actual.length).toBe(4)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
      await existsNodes(null, actual)
    })

    it('存在しないディレクトリを指定した場合 - 上位ノードは存在する', async () => {
      await storageService.createDirs(null, [`${TEST_FILES_DIR}`])

      const actual = await storageService.getHierarchicalDescendants(null, `${TEST_FILES_DIR}/d1/d11`)

      expect(actual.length).toBe(1)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}`)
    })

    it('存在しないディレクトリを指定した場合 - 上位ノードも存在しない', async () => {
      const actual = await storageService.getHierarchicalDescendants(null, `${TEST_FILES_DIR}/d1/d11`)

      expect(actual.length).toBe(0)
    })

    it(`パスの先頭・末尾に'/'を付与した場合`, async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // パスの先頭・末尾に'/'を付与
      const actual = await storageService.getHierarchicalDescendants(`/${TEST_FILES_DIR}/`, `/d1/d11/`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/fileA.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, actual)
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const actual = await storageService.getHierarchicalDescendants(`${TEST_FILES_DIR}`, `d1/d11`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/fileA.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, actual)
    })

    it('basePathを指定した場合 - dirPathを指定しない', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const actual = await storageService.getHierarchicalDescendants(`${TEST_FILES_DIR}`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/fileA.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, actual)
    })
  })

  describe('getHierarchicalChildren', () => {
    it('ノードの格納ディレクトリが存在する場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11/d111`])

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
          path: `${TEST_FILES_DIR}/d1/d11/d111/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = await storageService.getHierarchicalChildren(null, `${TEST_FILES_DIR}/d1/d11`)

      expect(actual.length).toBe(5)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/d111`)
      expect(actual[4].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
      await existsNodes(null, actual)
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
          path: `${TEST_FILES_DIR}/d1/d11/d111/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = await storageService.getHierarchicalChildren(null, `${TEST_FILES_DIR}/d1/d11`)

      expect(actual.length).toBe(5)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/d111`)
      expect(actual[4].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
      await existsNodes(null, actual)
    })

    it('ノードにIDが振られていない場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`])

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
          path: `${TEST_FILES_DIR}/d1/d11/d111/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // IDを強制的に未設定にする
      const nodes = await storageService.getHierarchicalChildren(null, `${TEST_FILES_DIR}/d1/d11`)
      await Promise.all(
        nodes.map(async node => {
          await storageService.saveMetadata(null, node, { id: null })
        })
      )

      const actual = await storageService.getHierarchicalChildren(null, `${TEST_FILES_DIR}/d1/d11`)

      expect(actual.length).toBe(5)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/d111`)
      expect(actual[4].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
      await existsNodes(null, actual)
    })

    it('存在しないディレクトリを指定した場合 - 上位ノードは存在する', async () => {
      await storageService.createDirs(null, [`${TEST_FILES_DIR}`])

      const actual = await storageService.getHierarchicalChildren(null, `${TEST_FILES_DIR}/d1/d11`)

      expect(actual.length).toBe(1)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}`)
    })

    it('存在しないディレクトリを指定した場合 - 上位ノードも存在しない', async () => {
      const actual = await storageService.getHierarchicalChildren(null, `${TEST_FILES_DIR}/d1/d11`)

      expect(actual.length).toBe(0)
    })

    it(`パスの先頭・末尾に'/'を付与した場合`, async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11`])

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
          path: `d1/d11/d111/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const actual = await storageService.getHierarchicalChildren(`/${TEST_FILES_DIR}/`, `/d1/d11/`)

      expect(actual.length).toBe(4)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/d111`)
      expect(actual[3].path).toBe(`d1/d11/fileA.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, actual)
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11`])

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
          path: `d1/d11/d111/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const actual = await storageService.getHierarchicalChildren(`${TEST_FILES_DIR}`, `d1/d11`)

      expect(actual.length).toBe(4)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/d111`)
      expect(actual[3].path).toBe(`d1/d11/fileA.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, actual)
    })

    it('basePathを指定した場合 - dirPathを指定しない', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11`, `d2/d21`])

      const actual = await storageService.getHierarchicalChildren(`${TEST_FILES_DIR}`)

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d2`)
      await existsNodes(`${TEST_FILES_DIR}`, actual)
    })
  })

  describe('getChildren', () => {
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

      const actual = await storageService.getChildren(null, `${TEST_FILES_DIR}/d1`)

      expect(Object.keys(actual).length).toBe(2)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      await existsNodes(null, Object.values(actual))
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
      const afterD1 = await storageService.getDirNode(null, `${TEST_FILES_DIR}/d1`)
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

    it('共有設定', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d12`])
      // 'd1'ディレクトリに共有設定しておく
      const d1Settings: StorageNodeShareSettings = { isPublic: true, uids: ['ichiro'] }
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, d1Settings)
      // 'd1/d12'ディレクトリに共有設定しておく
      const d12Settings: StorageNodeShareSettings = { isPublic: true, uids: ['juniro'] }
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1/d12`, d12Settings)

      // 'd1/d11', 'd1/d11/d111', 'd1/d12/d121', 'd2' ディレクトリを作成
      const actual = await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11/d111`, `${TEST_FILES_DIR}/d1/d12/d121`, `${TEST_FILES_DIR}/d2`])

      expect(actual.length).toBe(4)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1/d11/d111`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d12/d121`)
      expect(actual[3].path).toBe(`${TEST_FILES_DIR}/d2`)

      expect(actual[0].share).toEqual(d1Settings)
      expect(actual[1].share).toEqual(d1Settings)
      expect(actual[2].share).toEqual(d12Settings)
      expect(actual[3].share).toEqual(EMPTY_SHARE_SETTINGS)

      await existsNodes(null, actual)
    })

    it('共有設定 - basePathを指定した場合', async () => {
      // 'd1'ディレクトリを作成しておく
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])
      // 'd1'ディレクトリに共有設定しておく
      const d1Settings: StorageNodeShareSettings = { isPublic: true, uids: ['ichiro'] }
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}`, `d1`, d1Settings)

      // 'd1/d11'ディレクトリを作成
      const actual = await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11`])

      expect(actual.length).toBe(1)
      expect(actual[0].path).toBe(`d1/d11`)
      expect(actual[0].share).toEqual(d1Settings)

      await existsNodes(`${TEST_FILES_DIR}`, actual)
    })
  })

  describe('handleUploadedFiles', () => {
    it('ディレクトリ作成と共有設定', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d12`])
      // 'd1'ディレクトリに共有設定しておく
      const d1Settings: StorageNodeShareSettings = { isPublic: true, uids: ['ichiro'] }
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, d1Settings)
      // 'd1/d12'ディレクトリに共有設定しておく
      const d12Settings: StorageNodeShareSettings = { isPublic: true, uids: ['juniro'] }
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1/d12`, d12Settings)

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
      const actual = await storageService.handleUploadedFiles(
        null,
        uploadItems.map(item => item.path)
      )

      expect(actual.length).toBe(3)
      // 'd1/d11'ディレクトリが作成された
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d12/fileB.txt`)

      expect(actual[0].share).toEqual(d1Settings)
      expect(actual[1].share).toEqual(d1Settings)
      expect(actual[2].share).toEqual(d12Settings)

      await existsNodes(null, actual)
    })

    it('ディレクトリ作成と共有設定 - basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])
      // 'd1'ディレクトリに共有設定しておく
      const d1Settings: StorageNodeShareSettings = { isPublic: true, uids: ['ichiro'] }
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}`, `d1`, d1Settings)

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
      const actual = await storageService.handleUploadedFiles(
        `${TEST_FILES_DIR}`,
        uploadItems.map(item => item.path)
      )

      expect(actual.length).toBe(2)
      // 'd1/d11'ディレクトリが作成された
      expect(actual[0].path).toBe(`d1/d11`)
      expect(actual[1].path).toBe(`d1/d11/fileA.txt`)

      expect(actual[0].share).toEqual(d1Settings)
      expect(actual[1].share).toEqual(d1Settings)

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

      const actual = await storageService.removeDirs(null, [`${TEST_FILES_DIR}/d1`])

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/fileB.txt`)
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
      const actual = await storageService.removeDirs(null, [`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2/d21`])

      expect(actual.length).toBe(7)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
      expect(actual[3].path).toBe(`${TEST_FILES_DIR}/d1/d12`)
      expect(actual[4].path).toBe(`${TEST_FILES_DIR}/d1/d12/fileB.txt`)
      expect(actual[5].path).toBe(`${TEST_FILES_DIR}/d2/d21`)
      expect(actual[6].path).toBe(`${TEST_FILES_DIR}/d2/d21/fileC.txt`)
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

      const actual = await storageService.removeDirs(null, [`${TEST_FILES_DIR}/d1`])

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/fileB.txt`)
      await notExistsNodes(null, actual)
    })

    it('ディレクトリの一部が存在しない場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11/d111`])

      // ディレクトリ階層の中間のディレクトリを削除する
      const d11 = await storageService.getDirNode(null, `${TEST_FILES_DIR}/d1/d11`)
      await d11.gcsNode.delete()

      const actual = await storageService.removeDirs(null, [`${TEST_FILES_DIR}/d1`])

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d11/d111`)
      await notExistsNodes(null, actual)
    })

    it('存在しないディレクトリを指定した場合', async () => {
      const actual = await storageService.removeDirs(null, [`${TEST_FILES_DIR}/d1`])

      expect(actual.length).toBe(0)
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

      const actual = await storageService.removeDirs(`${TEST_FILES_DIR}`, [`d1`])

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/fileA.txt`)
      expect(actual[2].path).toBe(`d1/fileB.txt`)
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

      const actual = await storageService.removeDirs(`/${TEST_FILES_DIR}/`, [`/d1/`])

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/fileA.txt`)
      expect(actual[2].path).toBe(`d1/fileB.txt`)
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
      const actual = await storageService.removeDirs(null, ['', undefined, null as any])

      // 何も行われないことを検証
      expect(actual.length).toBe(0)
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

      const actual = await storageService.removeFiles(null, [`${TEST_FILES_DIR}/d1/fileA.txt`, `${TEST_FILES_DIR}/d2/fileB.txt`])

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d2/fileB.txt`)
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

      const actual = await storageService.removeFiles(`${TEST_FILES_DIR}`, [`d1/fileA.txt`, `d2/fileB.txt`])

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`d1/fileA.txt`)
      expect(actual[1].path).toBe(`d2/fileB.txt`)
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
      const actual = await storageService.removeFiles(`/${TEST_FILES_DIR}/`, [`/d1/fileA.txt/`, `/d2/fileB.txt/`])

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`d1/fileA.txt`)
      expect(actual[1].path).toBe(`d2/fileB.txt`)
      await notExistsNodes(`${TEST_FILES_DIR}`, actual)
    })

    it('存在しないファイルを指定', async () => {
      const actual = await storageService.removeFiles(null, [`${TEST_FILES_DIR}/d1/fileXXX.txt`])

      expect(actual.length).toBe(0)
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
      const actual = await storageService.removeFiles(null, ['', undefined, null as any])

      // 何も行われないことを検証
      expect(actual.length).toBe(0)
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

      // 'd1'を'd2/d1'へ移動
      const fromDirNodes: StorageNode[] = []
      fromDirNodes.push(await storageService.getDirNode(null, `${TEST_FILES_DIR}/d1`))
      fromDirNodes.push(await storageService.getDirNode(null, `${TEST_FILES_DIR}/d1/d11`))
      fromDirNodes.push(await storageService.getDirNode(null, `${TEST_FILES_DIR}/d1/d11/file1.txt`))
      const actual = await storageService.moveDir(null, fromDirNodes[0].path, `${TEST_FILES_DIR}/d2/d1`)

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

      // 'd1'を'd2/d1'へ移動
      const fromDirNodes: StorageNode[] = []
      fromDirNodes.push(await storageService.getDirNode(`${TEST_FILES_DIR}`, `d1`))
      fromDirNodes.push(await storageService.getDirNode(`${TEST_FILES_DIR}`, `d1/d11`))
      fromDirNodes.push(await storageService.getDirNode(`${TEST_FILES_DIR}`, `d1/d11/file1.txt`))
      const actual = await storageService.moveDir(`${TEST_FILES_DIR}`, fromDirNodes[0].path, `d2/d1`)

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

      // 'd1'を'd2/d1'へ移動
      // パスの先頭・末尾に'/'を付与
      const fromDirNodes: StorageNode[] = [
        await storageService.getDirNode(`${TEST_FILES_DIR}`, `d1`),
        await storageService.getDirNode(`${TEST_FILES_DIR}`, `d1/d11`),
        await storageService.getDirNode(`${TEST_FILES_DIR}`, `d1/d11/file1.txt`),
      ]
      const actual = await storageService.moveDir(`/${TEST_FILES_DIR}/`, `/${fromDirNodes[0].path}/`, `/d2/d1/`)

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

      // 'd1/docs'を'd2/docs'へ移動
      const fromDirNodes: StorageNode[] = []
      fromDirNodes.push(await storageService.getDirNode(null, `${TEST_FILES_DIR}/d1/docs`))
      fromDirNodes.push(await storageService.getFileNode(null, `${TEST_FILES_DIR}/d1/docs/fileA.txt`))
      const actual = await storageService.moveDir(null, fromDirNodes[0].path, `${TEST_FILES_DIR}/d2/docs`)

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d2/docs`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d2/docs/fileA.txt`)
      await existsNodes(null, actual)
      await notExistsNodes(null, fromDirNodes)

      const docsDirNodes = await storageService.getHierarchicalDescendants(null, `${TEST_FILES_DIR}/d2/docs`)
      expect(docsDirNodes.length).toBe(5)
      expect(docsDirNodes[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(docsDirNodes[1].path).toBe(`${TEST_FILES_DIR}/d2`)
      expect(docsDirNodes[2].path).toBe(`${TEST_FILES_DIR}/d2/docs`)
      expect(docsDirNodes[3].path).toBe(`${TEST_FILES_DIR}/d2/docs/fileA.txt`)
      expect(docsDirNodes[4].path).toBe(`${TEST_FILES_DIR}/d2/docs/fileB.txt`)
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

      const fromDirNodes: StorageNode[] = []
      fromDirNodes.push(await storageService.getDirNode(null, `${TEST_FILES_DIR}/d1/docs`))
      fromDirNodes.push(await storageService.getFileNode(null, `${TEST_FILES_DIR}/d1/docs/file.txt`))
      const actual = await storageService.moveDir(null, fromDirNodes[0].path, `${TEST_FILES_DIR}/d2/docs`)

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d2/docs`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d2/docs/file.txt`)
      await existsNodes(null, actual)
      await notExistsNodes(null, fromDirNodes)

      const fileNode = await storageService.getFileNode(null, `${TEST_FILES_DIR}/d2/docs/file.txt`)
      const fileData = await fileNode.gcsNode.download()
      expect(fileData.toString()).toBe('testA')
    })

    it('移動元と移動先が同じ場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      let actual: Error
      try {
        const fromDirNode = await storageService.getDirNode(null, `${TEST_FILES_DIR}/d1`)
        await storageService.moveDir(null, fromDirNode.path, fromDirNode.path + '/') // 移動先に''を付けて試す
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

      // 'd1'を'd2/d1'へ移動
      const fromDirNodes: StorageNode[] = []
      fromDirNodes.push(await storageService.getDirNode(null, `${TEST_FILES_DIR}/d1`))
      fromDirNodes.push(await storageService.getDirNode(null, `${TEST_FILES_DIR}/d1/d11/file1.txt`))
      const actual = await storageService.moveDir(null, fromDirNodes[0].path, `${TEST_FILES_DIR}/d2/d1`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d2/d1`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d2/d1/d11`) // ← 移動元に存在しなかったディレクトリが作成されている
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d2/d1/d11/fileA.txt`)
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
        const fromDirNode = await storageService.getDirNode(null, `${TEST_FILES_DIR}/d1`)
        await storageService.moveDir(null, fromDirNode.path, `${TEST_FILES_DIR}/d2/d1`)
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
        const fromDirNode = await storageService.getDirNode(`${TEST_FILES_DIR}`, `d1`)
        await storageService.moveDir(`${TEST_FILES_DIR}`, fromDirNode.path, `d2/d1`)
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

      // ルートディレクトリ(アプリケーションまたはユーザーディレクトリ)直下へ移動
      // 'd1/docs'をルートディレクトリ直下'docs'へ移動
      const fromDirNodes: StorageNode[] = []
      fromDirNodes.push(await storageService.getDirNode(`${TEST_FILES_DIR}`, `d1/docs`))
      fromDirNodes.push(await storageService.getDirNode(`${TEST_FILES_DIR}`, `d1/docs/fileA.txt`))
      const actual = await storageService.moveDir(`${TEST_FILES_DIR}`, fromDirNodes[0].path, `docs`)

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
        const fromDirNode = await storageService.getDirNode(null, `${TEST_FILES_DIR}/d1`)
        await storageService.moveDir(null, fromDirNode.path, `${TEST_FILES_DIR}/d1/aaa/bbb/d1`)
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The destination directory is its own subdirectory: '${TEST_FILES_DIR}/d1' -> '${TEST_FILES_DIR}/d1/aaa/bbb/d1'`)
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

    it('共有設定 - 移動元ディレクトリの共有設定はなく、かつ移動先ディレクトリは公開フラグがオンの場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 移動先'd2'の公開フラグをオンにしておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d2`, { isPublic: true })

      // 'd1/d11'を'd2/d11'へ移動
      const actual = await storageService.moveDir(null, `${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2/d11`)

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
      verify(await getNodesByActualNodes(null, actual))
    })

    it('共有設定 - 移動元ディレクトリの公開フラグがオンで、かつ移動先ディレクトリの公開フラグもオンの場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 移動元'd1'の公開フラグをオンにしておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true })

      // 移動先'd2'の公開フラグをオンにしておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d2`, { isPublic: true })

      // 'd1/d11'を'd2/d11'へ移動
      const actual = await storageService.moveDir(null, `${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2/d11`)

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
      verify(await getNodesByActualNodes(null, actual))
    })

    it('共有設定 - 移動元ディレクトリの公開フラグがオンで、かつ移動先ディレクトリの公開フラグもオフの場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 移動元'd1'の公開フラグをオンにしておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true })

      // 移動先'd2'の公開フラグをオフにしておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d2`, { isPublic: false })

      // 'd1/d11'を'd2/d11'へ移動
      const actual = await storageService.moveDir(null, `${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2/d11`)

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
      verify(await getNodesByActualNodes(null, actual))
    })

    it('共有設定 - 移動元ディレクトリの公開フラグがオフで、かつ移動先ディレクトリの公開フラグがオンの場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 移動元'd1'の公開フラグをオフにしておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: false })

      // 移動先'd2'の公開フラグをオンにしておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d2`, { isPublic: true })

      // 'd1/d11'を'd2/d11'へ移動
      const actual = await storageService.moveDir(null, `${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2/d11`)

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
      verify(await getNodesByActualNodes(null, actual))
    })

    it('共有設定 - 移動元ディレクトリの公開フラグがオフで、かつ配下に公開フラグがオンのノードがあり、かつ移動先ディレクトリの公開フラグがオフの場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 移動元'd1'の公開フラグをオフにしておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: false })
      // 移動元'd1'配下ノードの公開フラグをオンにしておく
      await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/d11/fileA.txt`, { isPublic: true })
      // 移動先'd2'の公開フラグをオフにしておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d2`, { isPublic: false })

      // 'd1/d11'を'd2/d11'へ移動
      const actual = await storageService.moveDir(null, `${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2/d11`)

      const verify = (nodes: StorageNode[]) => {
        expect(nodes.length).toBe(2)
        expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/d2/d11`)
        expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/d2/d11/fileA.txt`)

        expect(nodes[0].share).toEqual(EMPTY_SHARE_SETTINGS)
        // 'fileA.txt'に設定された公開フラグが維持されていることを検証
        expect(nodes[1].share).toEqual({ isPublic: true, uids: [] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await getNodesByActualNodes(null, actual))
    })

    it('共有設定 - 移動元ディレクトリに共有設定はなく、かつ移動先ディレクトリにユーザーIDの共有設定がある場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 移動先'd2'にユーザーIDの共有設定をしておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d2`, { uids: ['jiro'] })

      // 'd1/d11'を'd2/d11'へ移動
      const actual = await storageService.moveDir(null, `${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2/d11`)

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
      verify(await getNodesByActualNodes(null, actual))
    })

    it('共有設定 - 移動元ディレクトリにユーザーIDの共有設定があり、かつ移動先ディレクトリにユーザーIDの共有設定がない場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 'd1'にユーザーIDの共有設定をしておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })

      // 'd1/d11'を'd2/d11'へ移動
      const actual = await storageService.moveDir(null, `${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2/d11`)

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
      verify(await getNodesByActualNodes(null, actual))
    })

    it('共有設定 - 移動元ディレクトリにユーザーIDの共有設定があり、かつ移動先ディレクトリに別のユーザーIDの共有設定がある場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 移動元'd1'にユーザーIDを設定をしておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })
      // 移動先'd2'にユーザーIDを設定をしておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d2`, { uids: ['jiro'] })

      // 'd1/d11'を'd2/d11'へ移動
      const actual = await storageService.moveDir(null, `${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2/d11`)

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
      verify(await getNodesByActualNodes(null, actual))
    })

    it('共有設定 - 移動元ディレクトリにユーザーIDの共有設定があり、かつ配下ノードに別のユーザーIDが設定されていて、かつ移動先ディレクトリに別のユーザーIDの共有設定がある場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 移動元'd1'にユーザーIDを設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })
      // 移動元配下ノードにユーザーIDの共有設定をしておく
      await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/d11/fileA.txt`, { uids: ['saburo'] })
      // 移動先'd2'ユーザーIDを設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d2`, { uids: ['jiro'] })

      // 'd1/d11'を'd2/d11'へ移動
      const actual = await storageService.moveDir(null, `${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2/d11`)

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
      verify(await getNodesByActualNodes(null, actual))
    })

    it('共有設定 - basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11`, `d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 移動元'd1'にユーザーIDの共有設定をしておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}`, `d1`, { uids: ['ichiro'] })
      // 移動先'd2'にユーザーIDの共有設定をしておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}`, `d2`, { uids: ['jiro'] })

      // 'd1/d11'を'd2/d11'へ移動
      const actual = await storageService.moveDir(`${TEST_FILES_DIR}`, `d1/d11`, `d2/d11`)

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
      verify(await getNodesByActualNodes(`${TEST_FILES_DIR}`, actual))
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

      const fromFileNode = await storageService.getFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)
      const actual = await storageService.moveFile(null, fromFileNode.path, `${TEST_FILES_DIR}/d2/fileA.txt`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d2/fileA.txt`)
      await existsNodes(null, [actual!])
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

      const fromFileNode = await storageService.getFileNode(`${TEST_FILES_DIR}`, `d1/fileA.txt`)
      const actual = await storageService.moveFile(`${TEST_FILES_DIR}`, fromFileNode.path, `d2/fileA.txt`)

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
      const fromFileNode = await storageService.getFileNode(`/${TEST_FILES_DIR}/`, `/d1/fileA.txt/`)
      const actual = await storageService.moveFile(`/${TEST_FILES_DIR}/`, fromFileNode.path, `/d2/fileA.txt/`)

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

      const fromFileNode = await storageService.getFileNode(null, `${TEST_FILES_DIR}/d1/file.txt`)
      const actual = await storageService.moveFile(null, fromFileNode.path, `${TEST_FILES_DIR}/d2/file.txt`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d2/file.txt`)
      await existsNodes(null, [actual])
      await notExistsNodes(null, [fromFileNode])

      const toFileNode = await storageService.getFileNode(null, `${TEST_FILES_DIR}/d2/file.txt`)
      const toFileData = await toFileNode.gcsNode.download()
      expect(toFileData.toString()).toBe('testA')
    })

    it('移動元ファイルがない場合', async () => {
      let actual: Error
      try {
        const fromFileNode = await storageService.getFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)
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
        const fromFileNode = await storageService.getFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)
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

    it('共有設定 - 移動元ディレクトリの共有設定はなく、かつ移動先ディレクトリは公開フラグがオンの場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 移動先'd2'に公開フラグを設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d2`, { isPublic: true })

      // 'd1/fileA.txt'を'd2/fileA.txt'へ移動
      const actual = await storageService.moveFile(null, `${TEST_FILES_DIR}/d1/fileA.txt`, `${TEST_FILES_DIR}/d2/fileA.txt`)

      const verify = (fileNode: StorageNode) => {
        expect(fileNode.path).toBe(`${TEST_FILES_DIR}/d2/fileA.txt`)
        // 移動先'd2'の公開フラグが適用されていることを検証
        expect(fileNode.share).toEqual({ isPublic: true, uids: [] })
      }
      verify(actual)
      verify(await storageService.getFileNode(null, actual.path))
    })

    it('共有設定 - 移動元ディレクトリの公開フラグがオンで、かつ移動先ディレクトリの公開フラグもオンの場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 移動元'd1'に共有設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true })
      // 移動元'd2'に共有設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d2`, { isPublic: true })

      // 'd1/fileA.txt'を'd2/fileA.txt'へ移動
      const actual = await storageService.moveFile(null, `${TEST_FILES_DIR}/d1/fileA.txt`, `${TEST_FILES_DIR}/d2/fileA.txt`)

      const verify = (fileNode: StorageNode) => {
        expect(fileNode.path).toBe(`${TEST_FILES_DIR}/d2/fileA.txt`)
        // 移動先'd2'の公開フラグが適用されていることを検証
        expect(fileNode.share).toEqual({ isPublic: true, uids: [] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await storageService.getFileNode(null, actual.path))
    })

    it('共有設定 - 移動元ディレクトリの公開フラグがオンで、かつ移動先ディレクトリの公開フラグがオフの場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 移動元'd1'に公開フラグを設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true })
      // 移動元'd2'に公開フラグを設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d2`, { isPublic: false })

      // 'd1/fileA.txt'を'd2/fileA.txt'へ移動
      const actual = await storageService.moveFile(null, `${TEST_FILES_DIR}/d1/fileA.txt`, `${TEST_FILES_DIR}/d2/fileA.txt`)

      const verify = (fileNode: StorageNode) => {
        expect(fileNode.path).toBe(`${TEST_FILES_DIR}/d2/fileA.txt`)
        // 移動先'd2'の公開フラグが適用されていることを検証
        expect(fileNode.share).toEqual(EMPTY_SHARE_SETTINGS)
      }
      verify(actual)
      verify(await storageService.getFileNode(null, actual.path))
    })

    it('共有設定 - 移動元ディレクトリの公開フラグがオフで、かつ移動先ディレクトリの公開フラグがオンの場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 移動元'd1'に公開フラグを設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: false })
      // 移動元'd2'に公開フラグを設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d2`, { isPublic: true })

      // 'd1/fileA.txt'を'd2/fileA.txt'へ移動
      const actual = await storageService.moveFile(null, `${TEST_FILES_DIR}/d1/fileA.txt`, `${TEST_FILES_DIR}/d2/fileA.txt`)

      const verify = (fileNode: StorageNode) => {
        expect(fileNode.path).toBe(`${TEST_FILES_DIR}/d2/fileA.txt`)
        // 移動先'd2'の公開フラグが適用されていることを検証
        expect(fileNode.share).toEqual({ isPublic: true, uids: [] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await storageService.getFileNode(null, actual.path))
    })

    it('共有設定 - 移動元ディレクトリの公開フラグがオフで、かつ配下に公開フラグがオンのノードがあり、かつ移動先ディレクトリの公開フラグがオフの場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 移動元'd1'に公開フラグを設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: false })
      // 移動ファイルに公開フラグを設定しておく
      await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/fileA.txt`, { isPublic: true })
      // 移動先'd2'に公開フラグを設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d2`, { isPublic: false })

      // 'd1/fileA.txt'を'd2/fileA.txt'へ移動
      const actual = await storageService.moveFile(null, `${TEST_FILES_DIR}/d1/fileA.txt`, `${TEST_FILES_DIR}/d2/fileA.txt`)

      const verify = (fileNode: StorageNode) => {
        expect(fileNode.path).toBe(`${TEST_FILES_DIR}/d2/fileA.txt`)
        // 'fileA.txt'に独自設定された公開フラグが維持されていることを検証
        expect(fileNode.share).toEqual({ isPublic: true, uids: [] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await storageService.getFileNode(null, actual.path))
    })

    it('共有設定 - 移動元ディレクトリに共有設定がなく、かつ移動先ディレクトリにユーザーIDの共有設定がある場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 移動先'd2'にユーザーIDを設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d2`, { uids: ['jiro'] })

      // 'd1/fileA.txt'を'd2/fileA.txt'へ移動
      const actual = await storageService.moveFile(null, `${TEST_FILES_DIR}/d1/fileA.txt`, `${TEST_FILES_DIR}/d2/fileA.txt`)

      const verify = (fileNode: StorageNode) => {
        expect(fileNode.path).toBe(`${TEST_FILES_DIR}/d2/fileA.txt`)
        // 移動先'd2'のユーザーIDが適用されていることを検証
        expect(fileNode.share).toEqual({ isPublic: false, uids: ['jiro'] })
      }
      verify(actual)
      verify(await storageService.getFileNode(null, actual.path))
    })

    it('共有設定 - 移動元ディレクトリにユーザーIDの共有設定があり、かつ移動先ディレクトリにユーザーIDの共有設定がない場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 移動元'd1'に共有設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })

      // 'd1/fileA.txt'を'd2/fileA.txt'へ移動
      const actual = await storageService.moveFile(null, `${TEST_FILES_DIR}/d1/fileA.txt`, `${TEST_FILES_DIR}/d2/fileA.txt`)

      const verify = (fileNode: StorageNode) => {
        expect(fileNode.path).toBe(`${TEST_FILES_DIR}/d2/fileA.txt`)
        // 移動元'd1'のユーザーIDは除去され、移動先'd2'はユーザーIDの設定がないので、
        // 結果としてユーザーIDが未設定であることを検証
        expect(fileNode.share).toEqual(EMPTY_SHARE_SETTINGS)
      }
      verify(actual)
      verify(await storageService.getFileNode(null, actual.path))
    })

    it('共有設定 - 移動元ディレクトリにユーザーIDの共有設定があり、かつ移動先ディレクトリに別のユーザーIDの共有設定がある場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 移動元'd1'にユーザーIDを設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })
      // 移動先'd2'にユーザーIDを設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d2`, { uids: ['jiro'] })

      // 'd1/fileA.txt'を'd2/fileA.txt'へ移動
      const actual = await storageService.moveFile(null, `${TEST_FILES_DIR}/d1/fileA.txt`, `${TEST_FILES_DIR}/d2/fileA.txt`)

      const verify = (fileNode: StorageNode) => {
        expect(fileNode.path).toBe(`${TEST_FILES_DIR}/d2/fileA.txt`)
        // 移動元'd1'のユーザーIDは除去され、移動先'd2'のユーザーIDが適用されていることを検証
        expect(fileNode.share).toEqual({ isPublic: false, uids: ['jiro'] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await storageService.getFileNode(null, actual.path))
    })

    it('共有設定 - 移動元ディレクトリにユーザーIDの共有設定があり、かつファイルに別のユーザーIDが設定されていて、かつ移動先ディレクトリに別のユーザーIDの共有設定がある場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 移動元'd1'にユーザーIDを設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })
      // 移動ファイルにユーザーIDを設定しておく
      await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/fileA.txt`, { uids: ['saburo'] })
      // 移動先'd2'にユーザーIDを設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d2`, { uids: ['jiro'] })

      // 'd1/fileA.txt'を'd2/fileA.txt'へ移動
      const actual = await storageService.moveFile(null, `${TEST_FILES_DIR}/d1/fileA.txt`, `${TEST_FILES_DIR}/d2/fileA.txt`)

      const verify = (fileNode: StorageNode) => {
        expect(fileNode.path).toBe(`${TEST_FILES_DIR}/d2/fileA.txt`)
        // 移動元'd1'のユーザーIDは除去され、移動先'd2'のユーザーIDと'fileA.txt'のユーザーID
        // がマージされていることを検証
        expect(fileNode.share).toEqual({ isPublic: false, uids: ['saburo', 'jiro'] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await storageService.getFileNode(null, actual.path))
    })

    it('共有設定 - basePathを指定', async () => {
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

      // 移動元'd1'にユーザーIDを設定しておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}`, `d1`, { uids: ['ichiro'] })
      // 移動先'd2'にユーザーIDを設定しておく
      await storageService.setDirShareSettings(`${TEST_FILES_DIR}`, `d2`, { uids: ['jiro'] })

      // 'd1/fileA.txt'を'd2/fileA.txt'へ移動
      const actual = await storageService.moveFile(`${TEST_FILES_DIR}`, `d1/fileA.txt`, `d2/fileA.txt`)

      const verify = (fileNode: StorageNode) => {
        expect(fileNode.path).toBe(`d2/fileA.txt`)
        // 移動元'd1'のユーザーIDは除去され、移動先'd2'のユーザーIDが適用されていることを検証
        expect(fileNode.share).toEqual({ isPublic: false, uids: ['jiro'] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await storageService.getFileNode(`${TEST_FILES_DIR}`, actual.path))
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

      const dirNode = await storageService.getDirNode(null, `${TEST_FILES_DIR}/d1`)
      const actual = await storageService.renameDir(null, dirNode.path, `d2`)

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

      const dirNode = await storageService.getDirNode(`${TEST_FILES_DIR}`, `d1`)
      const actual = await storageService.renameDir(`${TEST_FILES_DIR}`, dirNode.path, `d2`)

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
      const dirNode = await storageService.getDirNode(`/${TEST_FILES_DIR}/`, `/d1/`)
      const actual = await storageService.renameDir(`/${TEST_FILES_DIR}/`, dirNode.path, `d2`)

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
        const dirNode = await storageService.getDirNode(null, `${TEST_FILES_DIR}/d1/docs`)
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
      const dirNode = await storageService.getDirNode(null, `${TEST_FILES_DIR}/d1/d1`)
      const actual = await storageService.renameDir(null, dirNode.path, `d2`)

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
      const dirNode = await storageService.getDirNode(null, `${TEST_FILES_DIR}/d1`)
      const actual = await storageService.renameDir(null, dirNode.path, `d1XXX`)

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

      const fromFileNode = await storageService.getFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)
      const actual = await storageService.renameFile(null, fromFileNode.path, 'fileB.txt')

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

      const fileNode = await storageService.getFileNode(`${TEST_FILES_DIR}`, `d1/fileA.txt`)
      const actual = await storageService.renameFile(`${TEST_FILES_DIR}`, fileNode.path, 'fileB.txt')

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
      const fileNode = await storageService.getFileNode(`/${TEST_FILES_DIR}/`, `/d1/fileA.txt/`)
      const actual = await storageService.renameFile(`/${TEST_FILES_DIR}/`, fileNode.path, 'fileB.txt')

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
        const fileNode = await storageService.getDirNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)
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

      const fileNode = await storageService.getFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt/fileA.txt`)
      const actual = await storageService.renameFile(null, fileNode.path, 'fileB.txt')

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
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`])

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
      await storageService.uploadAsFiles(null, uploadItems)
    })

    it('共有設定 - 共有未設定の状態から公開フラグをオンに設定', async () => {
      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true })

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
      verify(await getNodesByActualNodes(null, actual))
      await existsNodes(null, actual)
    })

    it('共有設定 - 公開フラグをオンの状態からオフに設定', async () => {
      // 自身のディレクトリの公開フラグをオンにしておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true })

      // 自身のディレクトリの共有解除
      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: false })

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
      verify(await getNodesByActualNodes(null, actual))
      await existsNodes(null, actual)
    })

    it('共有設定 - 公開フラグのみを変更した場合、他の項目に影響がないことを検証', async () => {
      // 自身のディレクトリにユーザーIDの共有設定をしておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })

      // 自身のディレクトリの公開フラグのみ変更
      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true })

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
      verify(await getNodesByActualNodes(null, actual))
      await existsNodes(null, actual)
    })

    it('共有設定 - 自身のディレクトリの公開フラグがオンの状態でかつ配下に公開フラグがオフのノードがある場合、この状態で自身のディレクトリに再度公開フラグをオンにした場合', async () => {
      // 自身のディレクトリの公開フラグをオンにしておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true })
      // 配下ノードにの公開フラグをオフにしておく
      await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/d11/fileB.txt`, { isPublic: false })

      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true })

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
      verify(await getNodesByActualNodes(null, actual))
      await existsNodes(null, actual)
    })

    it('共有設定 - ユーザーIDの共有が未設定の状態からユーザーIDを設定', async () => {
      const settings: StorageNodeShareSettingsInput = { uids: ['ichiro'] }
      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, settings)

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
      verify(await getNodesByActualNodes(null, actual))
      await existsNodes(null, actual)
    })

    it('共有設定 - ユーザーIDを除去', async () => {
      // 自身のディレクトリに共有設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })

      // 自身のディレクトリに空のユーザーIDを設定
      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { uids: [] })

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
      verify(await getNodesByActualNodes(null, actual))
      await existsNodes(null, actual)
    })

    it('共有設定 - ユーザーIDのみを変更した場合、他の項目に影響がないことを検証', async () => {
      // 自身のディレクトリに公開フラグを設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true })

      // 自身のディレクトリのユーザーIDのみ変更
      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })

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
      verify(await getNodesByActualNodes(null, actual))
      await existsNodes(null, actual)
    })

    it('共有設定 - 自身のディレクトリにユーザーIDの共有設定がされている状態で、自身のディレクトリに別のユーザーIDを設定した場合', async () => {
      // 自身のディレクトリにユーザーIDの共有設定をしておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { uids: ['jiro'] })

      // ディレクトリにユーザーIDの共有設定を行う
      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })

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
      verify(await getNodesByActualNodes(null, actual))
      await existsNodes(null, actual)
    })

    it('共有設定 - 自身のディレクトリにユーザーIDの共有設定がされていてかつ配下ノードに別のユーザーIDが共有設定されている状態で、自身のディレクトリに別のユーザーIDを設定した場合', async () => {
      // 自身のディレクトリにユーザーIDの共有設定をしておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })
      // 配下ノードにユーザーIDの共有設定をしておく
      await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/d11/fileB.txt`, { uids: ['jiro'] })

      // ディレクトリにユーザーIDの共有設定を行う
      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { uids: ['saburo'] })

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
      verify(await getNodesByActualNodes(null, actual))
      await existsNodes(null, actual)
    })

    it('共有設定 - 配下ノードにユーザーIDの共有設定がされている状態で、祖先のディレクトリに別のユーザーIDを設定した場合', async () => {
      // 配下ノードにユーザーIDの共有設定をしておく
      await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/d11/fileB.txt`, { uids: ['jiro'] })

      // ディレクトリにユーザーIDの共有設定を行う
      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })

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
      verify(await getNodesByActualNodes(null, actual))
      await existsNodes(null, actual)
    })

    it('共有設定 - 配下ノードにユーザーIDの共有設定がされている状態で、祖先のディレクトリに同じユーザーIDを設定した場合', async () => {
      // 配下ノードにユーザーIDの共有設定をしておく
      await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/d11/fileB.txt`, { uids: ['ichiro'] })

      // ディレクトリにユーザーIDの共有設定を行う
      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })

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
      verify(await getNodesByActualNodes(null, actual))
      await existsNodes(null, actual)
    })

    it('共有設定 - ファイルは存在するが親(または祖先)ディレクトリが存在しないディレクトリパスを指定した場合', async () => {
      // 'd2'はCloud Storageに存在しない(ただし配下に'fileC.txt'が存在する)
      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d2`, { isPublic: true })

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
      verify(await getNodesByActualNodes(null, actual))
      await existsNodes(null, actual)
    })

    it('nullを指定 - 共有設定なしから', async () => {
      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, null)

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
      verify(await getNodesByActualNodes(null, actual))
      await existsNodes(null, actual)
    })

    it('nullを指定 - 共有設定ありから', async () => {
      // 公開フラグ、ユーザーIDを設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true, uids: ['ichiro'] })

      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, null)

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
      verify(await getNodesByActualNodes(null, actual))
      await existsNodes(null, actual)
    })

    it('nullを指定 - 配下ノードの公開フラグとユーザーID設定ありから', async () => {
      // 配下ノードに公開フラグ、ユーザーIDを設定しておく
      await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/d11/fileB.txt`, { isPublic: true, uids: ['ichiro'] })

      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, null)

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
      verify(await getNodesByActualNodes(null, actual))
      await existsNodes(null, actual)
    })

    it('basePathを指定した場合', async () => {
      const settings: StorageNodeShareSettings = { isPublic: true, uids: ['ichiro'] }
      const actual = await storageService.setDirShareSettings(`${TEST_FILES_DIR}`, `d1`, settings)

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
      verify(await getNodesByActualNodes(`${TEST_FILES_DIR}`, actual))
      await existsNodes(`${TEST_FILES_DIR}`, actual)
    })

    it(`パスの先頭・末尾に'/'を付与`, async () => {
      const settings: StorageNodeShareSettings = { isPublic: true, uids: ['ichiro'] }
      const actual = await storageService.setDirShareSettings(`/${TEST_FILES_DIR}/`, `/d1/`, settings)

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
      verify(await getNodesByActualNodes(`${TEST_FILES_DIR}`, actual))
      await existsNodes(`${TEST_FILES_DIR}`, actual)
    })

    it('存在しないディレクトリを指定した場合', async () => {
      const settings: StorageNodeShareSettings = { isPublic: true, uids: ['ichiro'] }
      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/XXX`, settings)

      const verify = (nodes: StorageNode[]) => {
        expect(nodes.length).toBe(0)
      }
      verify(actual)
      verify(await getNodesByActualNodes(null, actual))
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
        expect(node.share).toEqual({ isPublic: true, uids: [] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await storageService.getFileNode(null, actual.path))
    })

    it('共有設定 - 設定なしの状態からユーザーIDを設定', async () => {
      const actual = await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/fileA.txt`, { uids: ['ichiro'] })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
        expect(node.share).toEqual({ isPublic: false, uids: ['ichiro'] } as StorageNodeShareSettings)
      }
      verify(actual)
      verify(await storageService.getFileNode(null, actual.path))
    })

    it('共有設定 - 公開フラグがオンの状態からオフへ設定', async () => {
      // 公開フラグをオフに設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true })

      // 公開フラグをオンに設定
      const actual = await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/fileA.txt`, { isPublic: false })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
        expect(node.share).toEqual(EMPTY_SHARE_SETTINGS)
      }
      verify(actual)
      verify(await storageService.getFileNode(null, actual.path))
    })

    it('共有設定 - ユーザーIDが設定されているの状態からユーザーIDを未設定へ変更', async () => {
      // ユーザーIDを設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { uids: ['ichiro'] })

      // ユーザーIDを未設定へ変更
      const actual = await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/fileA.txt`, { uids: [] })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
        expect(node.share).toEqual(EMPTY_SHARE_SETTINGS)
      }
      verify(actual)
      verify(await storageService.getFileNode(null, actual.path))
    })

    it('存在しないファイルを指定した場合', async () => {
      let actual: Error
      try {
        await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/zzz.txt`, { isPublic: true })
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The specified file does not exist: '${TEST_FILES_DIR}/d1/zzz.txt'`)
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
      verify(await storageService.getFileNode(null, actual.path))
    })

    it('basePathを指定した場合', async () => {
      const settings: StorageNodeShareSettings = { isPublic: true, uids: ['ichiro'] }
      const actual = await storageService.setFileShareSettings(`${TEST_FILES_DIR}`, `d1/fileA.txt`, settings)

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual(settings)
      }
      verify(actual)
      verify(await storageService.getFileNode(`${TEST_FILES_DIR}`, actual.path))
    })

    it(`filePath、basePathの先頭・末尾に'/'を付与`, async () => {
      const settings: StorageNodeShareSettings = { isPublic: true, uids: ['ichiro'] }
      const actual = await storageService.setFileShareSettings(`/${TEST_FILES_DIR}/`, `/d1/fileA.txt/`, settings)

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual(settings)
      }
      verify(actual)
      verify(await storageService.getFileNode(`${TEST_FILES_DIR}`, actual.path))
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
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      const actual = await storageService.getNode(null, `${TEST_FILES_DIR}/d1/`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.exists).toBeTruthy()
      await existsNodes(null, [actual])
    })

    it('ディレクトリの取得 - basePathを指定', async () => {
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

      const actual = await storageService.getNode(`${TEST_FILES_DIR}`, `d1/`)

      expect(actual.path).toBe(`d1`)
      expect(actual.exists).toBeTruthy()
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })

    it(`ディレクトリの取得 - パスの先頭・末尾に'/'を付与`, async () => {
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

      const actual = await storageService.getNode(`/${TEST_FILES_DIR}/`, `/d1/`)

      expect(actual.path).toBe(`d1`)
      expect(actual.exists).toBeTruthy()
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })

    it(`ディレクトリの取得 - 引数のパス指定で末尾に'/'を付与しない場合`, async () => {
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // 末尾に'/'を付与しない
      const actual = await storageService.getNode(null, `${TEST_FILES_DIR}/d1`)

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

      const actual = await storageService.getNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)

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

      const actual = await storageService.getNode(`${TEST_FILES_DIR}`, `d1/fileA.txt`)

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
      const actual = await storageService.getNode(`/${TEST_FILES_DIR}/`, `/d1/fileA.txt`)

      expect(actual.path).toBe(`d1/fileA.txt`)
      expect(actual.exists).toBeTruthy()
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })
  })

  describe('getDirNode', () => {
    it('ベーシックケース', async () => {
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      const actual = await storageService.getDirNode(null, `${TEST_FILES_DIR}/d1`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.exists).toBeTruthy()
      await existsNodes(null, [actual])
    })

    it(`basePathを指定した場合 + パスの先頭・末尾に'/'を付与`, async () => {
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

      // パスの先頭・末尾に'/'を付与
      const actual = await storageService.getDirNode(`/${TEST_FILES_DIR}/`, `/d1/`)

      expect(actual.path).toBe(`d1`)
      expect(actual.exists).toBeTruthy()
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })
  })

  describe('getFileNode', () => {
    it('ベーシックケース', async () => {
      const uploadItems: UploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = await storageService.getFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)

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
      const actual = await storageService.getFileNode(`/${TEST_FILES_DIR}/`, `/d1/fileA.txt/`)

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

  describe('getDirDescendantMap', () => {
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

      const actual = await storageService.getDirDescendantMap(null, `${TEST_FILES_DIR}/d1`)

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

      const actual = await storageService.getDirDescendantMap(null, `${TEST_FILES_DIR}/d1`)

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

      const actual = await storageService.getDirDescendantMap(null, `${TEST_FILES_DIR}/d1`)

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

      const actual = await storageService.getDirDescendantMap(`${TEST_FILES_DIR}`, `d1`)

      expect(Object.keys(actual).length).toBe(2)
      expect(actual[`d1`].exists).toBeTruthy()
      expect(actual[`d1/fileA.txt`].exists).toBeTruthy()
      await existsNodes(`${TEST_FILES_DIR}`, Object.values(actual))
    })
  })

  describe('getDirChildMap', () => {
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

      const actual = await storageService.getDirChildMap(null, `${TEST_FILES_DIR}/d1`)

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

      const actual = await storageService.getDirChildMap(null, `${TEST_FILES_DIR}/d1`)

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

      const actual = await storageService.getDirChildMap(null, `${TEST_FILES_DIR}/d1`)

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

      const actual = await storageService.getDirChildMap(`${TEST_FILES_DIR}`, `d1`)

      expect(Object.keys(actual).length).toBe(2)
      expect(actual[`d1`].exists).toBeTruthy()
      expect(actual[`d1/fileA.txt`].exists).toBeTruthy()
      await existsNodes(`${TEST_FILES_DIR}`, Object.values(actual))
    })
  })

  describe('getDescendantMap', () => {
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

      const actual = await storageService.getDescendantMap(null, `${TEST_FILES_DIR}/d1`)

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

      const actual = await storageService.getDescendantMap(null, `${TEST_FILES_DIR}/d1`)

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
      const nodeMap = await storageService.getDescendantMap(null, `${TEST_FILES_DIR}/d1`)
      await Promise.all(
        Object.values(nodeMap).map(async node => {
          await storageService.saveMetadata(null, node, { id: null })
        })
      )

      const actual = await storageService.getDescendantMap(null, `${TEST_FILES_DIR}/d1`)

      expect(Object.keys(actual).length).toBe(3)
      expect(actual[`${TEST_FILES_DIR}/d1/d11`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1/d11/fileA.txt`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1/d11/fileB.txt`].exists).toBeTruthy()
      await existsNodes(null, Object.values(actual))
    })

    it('存在しないディレクトリを指定した場合', async () => {
      await storageService.createDirs(null, [`${TEST_FILES_DIR}`])

      const actual = await storageService.getDescendantMap(null, `${TEST_FILES_DIR}/d1`)

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
      const actual = await storageService.getDescendantMap(`/${TEST_FILES_DIR}/`, `/d1/`)

      expect(Object.keys(actual).length).toBe(1)
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
            path: `d1/d11/fileA.txt`,
          },
          {
            data: 'testB',
            contentType: 'text/plain; charset=utf-8',
            path: `d1/d11/fileB.txt`,
          },
        ]
        await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

        const actual = await storageService.getDescendantMap(`${TEST_FILES_DIR}`, `d1`)

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

        const actual = await storageService.getDescendantMap(`${TEST_FILES_DIR}`, `d1`)

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

        const actual = await storageService.getDescendantMap(`${TEST_FILES_DIR}`)

        expect(Object.keys(actual).length).toBe(3)
        expect(actual[`d1`].exists).toBeTruthy()
        expect(actual[`d1/d11`].exists).toBeTruthy()
        expect(actual[`d1/d11/fileA.txt`].exists).toBeTruthy()
        await existsNodes(`${TEST_FILES_DIR}`, Object.values(actual))
      })
    })
  })

  describe('getChildMap', () => {
    it('ノードの格納ディレクトリが存在する場合', async () => {
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

      const actual = await storageService.getChildMap(null, `${TEST_FILES_DIR}/d1`)

      expect(Object.keys(actual).length).toBe(2)
      expect(actual[`${TEST_FILES_DIR}/d1/d11`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1/fileA.txt`].exists).toBeTruthy()
      await existsNodes(null, Object.values(actual))
    })

    it('ノードの格納ディレクトリが存在しない場合', async () => {
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

      const actual = await storageService.getChildMap(null, `${TEST_FILES_DIR}/d1`)

      expect(Object.keys(actual).length).toBe(2)
      expect(actual[`${TEST_FILES_DIR}/d1/d11`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1/fileA.txt`].exists).toBeTruthy()
      await existsNodes(null, Object.values(actual))
    })

    it('ノードにIDが振られていない場合', async () => {
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
      const nodeMap = await storageService.getChildMap(null, `${TEST_FILES_DIR}/d1`)
      await Promise.all(
        Object.values(nodeMap).map(async node => {
          await storageService.saveMetadata(null, node, { id: null })
        })
      )

      const actual = await storageService.getChildMap(null, `${TEST_FILES_DIR}/d1`)

      expect(Object.keys(actual).length).toBe(2)
      expect(shortid.isValid(actual[`${TEST_FILES_DIR}/d1/d11`].id)).toBeTruthy()
      expect(shortid.isValid(actual[`${TEST_FILES_DIR}/d1/fileA.txt`].id)).toBeTruthy()
      await existsNodes(null, Object.values(actual))
    })

    it('存在しないディレクトリを指定した場合', async () => {
      await storageService.createDirs(null, [`${TEST_FILES_DIR}`])

      const actual = await storageService.getChildMap(null, `${TEST_FILES_DIR}/d1`)

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

      const actual = await storageService.getChildMap(`/${TEST_FILES_DIR}/`, `/d1/`)

      expect(Object.keys(actual).length).toBe(2)
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

        const actual = await storageService.getChildMap(`${TEST_FILES_DIR}`, `d1`)

        expect(Object.keys(actual).length).toBe(2)
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

        const actual = await storageService.getChildMap(`${TEST_FILES_DIR}`, `d1`)

        expect(Object.keys(actual).length).toBe(2)
        expect(actual[`d1/d11`].exists).toBeTruthy()
        expect(actual[`d1/fileA.txt`].exists).toBeTruthy()
        await existsNodes(`${TEST_FILES_DIR}`, Object.values(actual))
      })

      it('dirPathを指定しない場合', async () => {
        // ディレクトリを作成
        await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11`, `d2/d21`])

        const actual = await storageService.getChildMap(`${TEST_FILES_DIR}`)

        expect(Object.keys(actual).length).toBe(2)
        expect(actual[`d1`].exists).toBeTruthy()
        expect(actual[`d2`].exists).toBeTruthy()
        await existsNodes(`${TEST_FILES_DIR}`, Object.values(actual))
      })
    })
  })

  describe('saveDirNode', () => {
    it('ベーシックケース', async () => {
      const d1 = await storageService.getDirNode(null, `${TEST_FILES_DIR}/d1`)
      const d1_gcsNode = d1.gcsNode
      expect(d1.exists).toBeFalsy()
      expect(d1.share).toEqual({ isPublic: false, uids: [] })

      const actual = await storageService.saveDirNode(null, d1, { share: { isPublic: true, uids: ['ichiro'] } })

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.share).toEqual({ isPublic: true, uids: ['ichiro'] })
      expect(actual.exists).toBeTruthy()
      expect(actual.gcsNode).toBe(d1_gcsNode)
      await existsNodes(null, [actual])
    })

    it('メタデータを指定しない場合', async () => {
      const d1 = await storageService.getDirNode(null, `${TEST_FILES_DIR}/d1`)
      const d1_gcsNode = d1.gcsNode
      expect(d1.exists).toBeFalsy()
      expect(d1.share).toEqual({ isPublic: false, uids: [] })

      const actual = await storageService.saveDirNode(null, d1)

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.share).toEqual({ isPublic: false, uids: [] })
      expect(actual.exists).toBeTruthy()
      expect(actual.gcsNode).toBe(d1_gcsNode)
      await existsNodes(null, [actual])
    })

    it('既に存在するノードの保存を行った場合', async () => {
      const d1 = await storageService.getDirNode(null, `${TEST_FILES_DIR}/d1`)

      // saveDirNode()を実行
      Object.assign(d1, await storageService.saveDirNode(null, d1))
      const id = d1.id
      const d1_gcsNode = d1.gcsNode
      expect(shortid.isValid(d1.id)).toBeTruthy()
      expect(d1.exists).toBeTruthy()
      expect(d1.share).toEqual({ isPublic: false, uids: [] })

      // saveDirNode()を再度実行する
      const actual = await storageService.saveDirNode(null, d1, { share: { isPublic: true, uids: ['ichiro'] } })

      expect(actual.id).toBe(id)
      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.share).toEqual({ isPublic: true, uids: ['ichiro'] })
      expect(actual.exists).toBeTruthy()
      expect(actual.gcsNode).toBe(d1_gcsNode)
      await existsNodes(null, [actual])
    })

    it('ファイルを指定した場合', async () => {
      const fileA = await storageService.getFileNode(null, `${TEST_FILES_DIR}/fileA.txt`)

      let actual!: Error
      try {
        await storageService.saveDirNode(null, fileA)
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The specified node is not directory: { path: '${fileA.path}', nodeType: '${fileA.nodeType}' }`)
    })

    it('basePathを指定した場合', async () => {
      const d1 = await storageService.getDirNode(`${TEST_FILES_DIR}`, `d1`)
      const d1_gcsNode = d1.gcsNode
      expect(d1.exists).toBeFalsy()
      expect(d1.share).toEqual({ isPublic: false, uids: [] })

      const actual = await storageService.saveDirNode(`${TEST_FILES_DIR}`, d1)

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.path).toBe(`d1`)
      expect(actual.share).toEqual({ isPublic: false, uids: [] })
      expect(actual.exists).toBeTruthy()
      expect(actual.gcsNode).toBe(d1_gcsNode)
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })

    it(`パスの先頭・末尾に'/'を付与した場合`, async () => {
      const d1 = await storageService.getDirNode(`${TEST_FILES_DIR}`, `d1`)
      const d1_gcsNode = d1.gcsNode
      expect(d1.exists).toBeFalsy()
      expect(d1.share).toEqual({ isPublic: false, uids: [] })

      const actual = await storageService.saveDirNode(`/${TEST_FILES_DIR}/`, d1)

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.path).toBe(`d1`)
      expect(actual.share).toEqual({ isPublic: false, uids: [] })
      expect(actual.exists).toBeTruthy()
      expect(actual.gcsNode).toBe(d1_gcsNode)
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })
  })

  describe('saveFileNode', () => {
    it('ベーシックケース', async () => {
      const fileA = await storageService.getFileNode(null, `${TEST_FILES_DIR}/fileA.txt`)
      const fileA_gcsNode = fileA.gcsNode
      expect(fileA.exists).toBeFalsy()
      expect(fileA.share).toEqual({ isPublic: false, uids: [] })

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
      const fileA = await storageService.getFileNode(null, `${TEST_FILES_DIR}/fileA.txt`)
      const fileA_gcsNode = fileA.gcsNode
      expect(fileA.exists).toBeFalsy()
      expect(fileA.share).toEqual({ isPublic: false, uids: [] })

      const actual = await storageService.saveFileNode(null, fileA, 'testA', { contentType: 'text/plain; charset=utf-8' })
      const [buffer] = await actual.gcsNode.download()
      const fileA_content = buffer.toString('utf-8')

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.path).toBe(`${TEST_FILES_DIR}/fileA.txt`)
      expect(actual.share).toEqual({ isPublic: false, uids: [] })
      expect(actual.gcsNode).toBe(fileA_gcsNode)
      expect(fileA_content).toBe('testA')
      await existsNodes(null, [actual])
    })

    it('既に存在するノードの保存を行った場合', async () => {
      const fileA = await storageService.getFileNode(null, `${TEST_FILES_DIR}/fileA.txt`)

      // saveDirNode()を実行
      Object.assign(fileA, await storageService.saveFileNode(null, fileA, 'testA-1', { contentType: 'text/plain; charset=utf-8' }))
      const id = fileA.id
      const d1_gcsNode = fileA.gcsNode
      expect(shortid.isValid(fileA.id)).toBeTruthy()
      expect(fileA.exists).toBeTruthy()
      expect(fileA.share).toEqual({ isPublic: false, uids: [] })

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
      const d1 = await storageService.getDirNode(null, `${TEST_FILES_DIR}/d1`)

      let actual!: Error
      try {
        await storageService.saveFileNode(null, d1, 'testA', { contentType: 'text/plain; charset=utf-8' })
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The specified node is not file: { path: '${d1.path}', nodeType: '${d1.nodeType}' }`)
    })

    it('basePathを指定した場合', async () => {
      const fileA = await storageService.getFileNode(`${TEST_FILES_DIR}`, `fileA.txt`)
      const fileA_gcsNode = fileA.gcsNode
      expect(fileA.exists).toBeFalsy()
      expect(fileA.share).toEqual({ isPublic: false, uids: [] })

      const actual = await storageService.saveFileNode(`${TEST_FILES_DIR}`, fileA, 'testA', { contentType: 'text/plain; charset=utf-8' })
      const [buffer] = await actual.gcsNode.download()
      const fileA_content = buffer.toString('utf-8')

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.path).toBe(`fileA.txt`)
      expect(actual.share).toEqual({ isPublic: false, uids: [] })
      expect(actual.gcsNode).toBe(fileA_gcsNode)
      expect(fileA_content).toBe('testA')
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })

    it(`パスの先頭・末尾に'/'を付与した場合`, async () => {
      const fileA = await storageService.getFileNode(`${TEST_FILES_DIR}`, `fileA.txt`)
      const fileA_gcsNode = fileA.gcsNode
      expect(fileA.exists).toBeFalsy()
      expect(fileA.share).toEqual({ isPublic: false, uids: [] })

      const actual = await storageService.saveFileNode(`/${TEST_FILES_DIR}/`, fileA, 'testA', { contentType: 'text/plain; charset=utf-8' })
      const [buffer] = await actual.gcsNode.download()
      const fileA_content = buffer.toString('utf-8')

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.path).toBe(`fileA.txt`)
      expect(actual.share).toEqual({ isPublic: false, uids: [] })
      expect(actual.gcsNode).toBe(fileA_gcsNode)
      expect(fileA_content).toBe('testA')
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })
  })

  describe('toStorageNode', () => {
    it('ディレクトリノードの変換 - 存在しないディレクトリ', async () => {
      const d1 = await storageService.getDirNode(null, `${TEST_FILES_DIR}/d1`)

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
      const d1 = await storageService.getDirNode(null, `${TEST_FILES_DIR}/d1`)
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
      const fileA = await storageService.getFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)

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
      const fileA = await storageService.getFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)
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
      const fileA = await storageService.getFileNode(`${TEST_FILES_DIR}`, `d1/fileA.txt`)

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
      const nodeMap = [...dirs, ...files].reduce((result, node) => {
        result[node.path] = node
        return result
      }, {} as { [path: string]: GCSStorageNode })

      // ノードマップの歯抜けノードを取得 - topPathを指定しない
      const actual = await storageService.padVirtualDirNodes(null, nodeMap, null)

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
      const nodeMap = [...dirs, ...files].reduce((result, node) => {
        result[node.path] = node
        return result
      }, {} as { [path: string]: GCSStorageNode })

      // ノードマップの歯抜けノードを取得 - topPathを指定
      const actual = await storageService.padVirtualDirNodes(null, nodeMap, `${TEST_FILES_DIR}/d1`)

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
      const nodeMap = [...dirs].reduce((result, node) => {
        result[node.path] = node
        return result
      }, {} as { [path: string]: GCSStorageNode })

      // ノードマップの歯抜けノードを取得 - topPathを指定
      const actual = await storageService.padVirtualDirNodes(null, nodeMap, `${TEST_FILES_DIR}/d1`)

      expect(Object.keys(actual).length).toBe(0)
    })

    it('topPathを指定した場合 - topPathノードが存在しない - 配下にノードが存在しない', async () => {
      // ノードマップの歯抜けノードを取得 - topPathを指定
      const actual = await storageService.padVirtualDirNodes(null, {}, `${TEST_FILES_DIR}/d1`)

      expect(Object.keys(actual).length).toBe(0)
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
      const nodeMap = [...files].reduce((result, node) => {
        result[node.path] = node
        return result
      }, {} as { [path: string]: GCSStorageNode })

      // ノードマップの歯抜けノードを取得 - topPathを指定
      const actual = await storageService.padVirtualDirNodes(null, nodeMap, `${TEST_FILES_DIR}/d1`)

      expect(Object.keys(actual).length).toBe(1)
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
      const nodeMap = [...dirs, ...files].reduce((result, node) => {
        result[node.path] = node
        return result
      }, {} as { [path: string]: GCSStorageNode })

      // ノードマップの歯抜けノードを取得 - bsePathを指定 - topPathを指定しない
      const actual = await storageService.padVirtualDirNodes(`${TEST_FILES_DIR}`, nodeMap, null)

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
      const nodeMap = [...dirs, ...files].reduce((result, node) => {
        result[node.path] = node
        return result
      }, {} as { [path: string]: GCSStorageNode })

      // ノードマップの歯抜けノードを取得 - basePathを指定 - topPathを指定
      const actual = await storageService.padVirtualDirNodes(`${TEST_FILES_DIR}`, nodeMap, `d1`)

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
      const nodeMap = [...dirs, ...files].reduce((result, node) => {
        result[node.path] = node
        return result
      }, {} as { [path: string]: GCSStorageNode })

      // ノードマップの歯抜けノードを取得 - パスの先頭・末尾に'/'を付与
      const actual = await storageService.padVirtualDirNodes(`/${TEST_FILES_DIR}/`, nodeMap, `/d1/`)

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
      const dirs = [await storageService.getDirNode(null, `${TEST_FILES_DIR}/d1`)]

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
      const nodeMap = [...dirs, ...files].reduce((result, node) => {
        result[node.path] = node
        return result
      }, {} as { [path: string]: GCSStorageNode })

      // ノードマップの歯抜けノードを穴埋め - topPathを指定しない
      const actual = await storageService.padRealDirNodes(null, nodeMap, null)

      expect(Object.keys(actual).length).toBe(4)
      expect(actual[`${TEST_FILES_DIR}`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1/d11`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1/d11/fileA.txt`].exists).toBeTruthy()
      await existsNodes(null, Object.values(actual))
    })

    it('topPathを指定した場合', async () => {
      // 存在しないディレクトリを取得
      const dirs = [await storageService.getDirNode(null, `${TEST_FILES_DIR}/d1`)]

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
      const nodeMap = [...dirs, ...files].reduce((result, node) => {
        result[node.path] = node
        return result
      }, {} as { [path: string]: GCSStorageNode })

      // ノードマップの歯抜けノードを穴埋め - topPathを指定
      const actual = await storageService.padRealDirNodes(null, nodeMap, `${TEST_FILES_DIR}/d1`)

      expect(Object.keys(actual).length).toBe(3)
      expect(actual[`${TEST_FILES_DIR}/d1`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1/d11`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/d1/d11/fileA.txt`].exists).toBeTruthy()
      await existsNodes(null, Object.values(actual))
    })

    it('basePathを指定した場合', async () => {
      // 存在しないディレクトリを取得
      const dirs = [await storageService.getDirNode(`${TEST_FILES_DIR}`, `d1`)]

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
      const nodeMap = [...dirs, ...files].reduce((result, node) => {
        result[node.path] = node
        return result
      }, {} as { [path: string]: GCSStorageNode })

      // ノードマップの歯抜けノードを穴埋め - topPathを指定
      const actual = await storageService.padRealDirNodes(`${TEST_FILES_DIR}`, nodeMap, `d1`)

      expect(Object.keys(actual).length).toBe(3)
      expect(actual[`d1`].exists).toBeTruthy()
      expect(actual[`d1/d11`].exists).toBeTruthy()
      expect(actual[`d1/d11/fileA.txt`].exists).toBeTruthy()
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
