import * as admin from 'firebase-admin'
import * as fs from 'fs'
import * as path from 'path'
import { FirestoreServiceDI, SignedUploadUrlInput, StorageNode, StorageNodeType, UploadDataItem } from '../../../../../src/lib'
import { MockBaseAppModule, MockDevUtilsServiceDI, MockRESTContainerModule, MockStorageServiceDI } from '../../../../mocks/lib'
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

const GENERAL_USER = { uid: 'yamada.one', storageDir: 'yamada.one' }
const TEST_FILES_DIR = 'test-files'

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

describe('StorageService', () => {
  let storageService: MockStorageServiceDI.type
  let devUtilsService: MockDevUtilsServiceDI.type

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [MockDevUtilsServiceDI.provider, FirestoreServiceDI.provider, MockStorageServiceDI.provider],
    }).compile()

    storageService = module.get<MockStorageServiceDI.type>(MockStorageServiceDI.symbol)
    devUtilsService = module.get<MockDevUtilsServiceDI.type>(MockDevUtilsServiceDI.symbol)

    await storageService.removeStorageDir(`${TEST_FILES_DIR}`)
    await storageService.removeStorageDir(`${storageService.getUserStorageDirPath(GENERAL_USER)}/`)
  })

  describe('sendFile', () => {
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

    it('画像ファイルをダウンロード', async () => {
      const localFilePath = `${__dirname}/${TEST_FILES_DIR}/desert.jpg`
      const toFilePath = `${TEST_FILES_DIR}/desert.jpg`
      await storageService.uploadLocalFiles([{ localFilePath, toFilePath }])

      return request(app.getHttpServer())
        .get(`/unit/storage/${toFilePath}`)
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
        path: `${TEST_FILES_DIR}/fileA.txt`,
      }
      await storageService.uploadAsFiles([uploadItem])

      return request(app.getHttpServer())
        .get(`/unit/storage/${uploadItem.path}`)
        .expect(200)
        .then((res: Response) => {
          expect(res.text).toEqual(uploadItem.data)
        })
    })

    it('If-Modified-Sinceの検証', async () => {
      const uploadItem: UploadDataItem = {
        data: 'test',
        contentType: 'text/plain; charset=utf-8',
        path: `${TEST_FILES_DIR}/fileA.txt`,
      }
      const uploadedFileNode = (await storageService.uploadAsFiles([uploadItem]))[0]

      return request(app.getHttpServer())
        .get(`/unit/storage/${uploadItem.path}`)
        .set('If-Modified-Since', uploadedFileNode.updated!.toString())
        .expect(304)
    })

    it('存在しないファイルを指定', async () => {
      return request(app.getHttpServer())
        .get(`/unit/storage/${TEST_FILES_DIR}/fileA.txt`)
        .expect(404)
    })
  })

  describe('uploadLocalFiles', () => {
    it('単一ファイルをアップロード', async () => {
      const localFilePath = `${__dirname}/${TEST_FILES_DIR}/fileA.txt`
      const toFilePath = `${TEST_FILES_DIR}/fileA.txt`

      const actual = await storageService.uploadLocalFiles([{ localFilePath, toFilePath }])

      expect(actual[0].nodeType).toBe(StorageNodeType.File)
      expect(actual[0].name).toBe('fileA.txt')
      expect(actual[0].dir).toBe(TEST_FILES_DIR)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/fileA.txt`)
      expect(dayjs(actual[0].created).isValid()).toBeTruthy()
      expect(dayjs(actual[0].updated).isValid()).toBeTruthy()

      const toDirNodes = await storageService.getStorageDirNodes(`${TEST_FILES_DIR}`)
      expect(toDirNodes.length).toBe(2)
      expect(toDirNodes[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(toDirNodes[1].path).toBe(`${TEST_FILES_DIR}/fileA.txt`)
    })

    it(`単一ファイルをアップロード - toFilePathの先頭に'/'を付与`, async () => {
      const localFilePath = `${__dirname}/${TEST_FILES_DIR}/fileA.txt`
      const toFilePath = `/${TEST_FILES_DIR}/fileA.txt` // ← 先頭に'/'を付与

      const actual = await storageService.uploadLocalFiles([{ localFilePath, toFilePath }])

      expect(actual[0].nodeType).toBe(StorageNodeType.File)
      expect(actual[0].name).toBe('fileA.txt')
      expect(actual[0].dir).toBe(TEST_FILES_DIR)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/fileA.txt`)
      expect(dayjs(actual[0].created).isValid()).toBeTruthy()
      expect(dayjs(actual[0].updated).isValid()).toBeTruthy()

      const toDirNodes = await storageService.getStorageDirNodes(`${TEST_FILES_DIR}`)
      expect(toDirNodes.length).toBe(2)
      expect(toDirNodes[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(toDirNodes[1].path).toBe(`${TEST_FILES_DIR}/fileA.txt`)
    })

    it('単一ファイルをアップロード - basePathを指定', async () => {
      const localFilePath = `${__dirname}/${TEST_FILES_DIR}/fileA.txt`
      const toFilePath = `fileA.txt`

      const actual = await storageService.uploadLocalFiles([{ localFilePath, toFilePath }], `${TEST_FILES_DIR}`) // ← basePathを指定

      expect(actual[0].nodeType).toBe(StorageNodeType.File)
      expect(actual[0].name).toBe('fileA.txt')
      expect(actual[0].dir).toBe('') // ← 空になる
      expect(actual[0].path).toBe(`fileA.txt`) // ← パスにbasePathは含まれない
      expect(dayjs(actual[0].created).isValid()).toBeTruthy()
      expect(dayjs(actual[0].updated).isValid()).toBeTruthy()

      const toDirNodes = await storageService.getStorageDirNodes(`${TEST_FILES_DIR}`)
      expect(toDirNodes.length).toBe(2)
      expect(toDirNodes[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(toDirNodes[1].path).toBe(`${TEST_FILES_DIR}/fileA.txt`)
    })

    it(`単一ファイルをアップロード - basePathの先頭・末尾に'/'を付与`, async () => {
      const localFilePath = `${__dirname}/${TEST_FILES_DIR}/fileA.txt`
      const toFilePath = `fileA.txt`

      // basePathの先頭・末尾に'/'を付与
      const actual = await storageService.uploadLocalFiles([{ localFilePath, toFilePath }], `/${TEST_FILES_DIR}/`)

      expect(actual[0].nodeType).toBe(StorageNodeType.File)
      expect(actual[0].name).toBe('fileA.txt')
      expect(actual[0].dir).toBe('')
      expect(actual[0].path).toBe(`fileA.txt`)
      expect(dayjs(actual[0].created).isValid()).toBeTruthy()
      expect(dayjs(actual[0].updated).isValid()).toBeTruthy()

      const toDirNodes = await storageService.getStorageDirNodes(`${TEST_FILES_DIR}`)
      expect(toDirNodes.length).toBe(2)
      expect(toDirNodes[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(toDirNodes[1].path).toBe(`${TEST_FILES_DIR}/fileA.txt`)
    })

    it('複数ファイルをアップロード', async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/fileB.txt`,
        },
      ]

      const actual = await storageService.uploadLocalFiles(uploadList)

      for (let i = 0; i < actual.length; i++) {
        expect(actual[i].nodeType).toBe(StorageNodeType.File)
        expect(actual[i].name).toBe(path.basename(uploadList[i].toFilePath))
        expect(actual[i].dir).toBe(TEST_FILES_DIR)
        expect(actual[i].path).toBe(uploadList[i].toFilePath)
        expect(dayjs(actual[i].created).isValid()).toBeTruthy()
        expect(dayjs(actual[i].updated).isValid()).toBeTruthy()
      }

      const toDirNodes = await storageService.getStorageDirNodes(`${TEST_FILES_DIR}`)
      expect(toDirNodes.length).toBe(3)
      expect(toDirNodes[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(toDirNodes[1].path).toBe(`${TEST_FILES_DIR}/fileA.txt`)
      expect(toDirNodes[2].path).toBe(`${TEST_FILES_DIR}/fileB.txt`)
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

  describe('getStorageDirNodes', () => {
    it('ディレクトリを作成した場合', async () => {
      // ディレクトリを作成
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/b1/b11`, `${TEST_FILES_DIR}/b1/b12`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileC.txt`,
          toFilePath: `${TEST_FILES_DIR}/fileC.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/b1/b11/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/b1/b12/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.getStorageDirNodes(`${TEST_FILES_DIR}`)

      expect(actual.length).toBe(7)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/b1`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/b1/b11`)
      expect(actual[3].path).toBe(`${TEST_FILES_DIR}/b1/b11/fileA.txt`)
      expect(actual[4].path).toBe(`${TEST_FILES_DIR}/b1/b12`)
      expect(actual[5].path).toBe(`${TEST_FILES_DIR}/b1/b12/fileB.txt`)
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
          toFilePath: `${TEST_FILES_DIR}/b1/b11/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/b1/b12/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.getStorageDirNodes(`${TEST_FILES_DIR}`)

      expect(actual.length).toBe(7)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/b1`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/b1/b11`)
      expect(actual[3].path).toBe(`${TEST_FILES_DIR}/b1/b11/fileA.txt`)
      expect(actual[4].path).toBe(`${TEST_FILES_DIR}/b1/b12`)
      expect(actual[5].path).toBe(`${TEST_FILES_DIR}/b1/b12/fileB.txt`)
      expect(actual[6].path).toBe(`${TEST_FILES_DIR}/fileC.txt`)
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createStorageDirs([`${TEST_FILES_DIR}`, `${TEST_FILES_DIR}/b1/b11`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/b1/b11/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileC.txt`,
          toFilePath: `${TEST_FILES_DIR}/fileC.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.getStorageDirNodes(`b1/b11`, `${TEST_FILES_DIR}`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`b1`)
      expect(actual[1].path).toBe(`b1/b11`)
      expect(actual[2].path).toBe(`b1/b11/fileA.txt`)
      // 'fileC.txt'は取得されない
    })

    it('basePathを指定した場合 - dirPathが空の場合', async () => {
      // ディレクトリを作成
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/b1/b11`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/b1/b11/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileC.txt`,
          toFilePath: `${TEST_FILES_DIR}/fileC.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.getStorageDirNodes('', `${TEST_FILES_DIR}`)

      expect(actual.length).toBe(4)
      expect(actual[0].path).toBe(`b1`)
      expect(actual[1].path).toBe(`b1/b11`)
      expect(actual[2].path).toBe(`b1/b11/fileA.txt`)
      // 'fileC.txt'は取得される
      expect(actual[3].path).toBe(`fileC.txt`)
    })

    it(`dirPath、basePathの先頭・末尾に'/'を付与`, async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `/${TEST_FILES_DIR}/b1/b11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // パスの先頭・末尾に'/'を付与
      const actual = await storageService.getStorageDirNodes('/b1/', `/${TEST_FILES_DIR}/`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`b1`)
      expect(actual[1].path).toBe(`b1/b11`)
      expect(actual[2].path).toBe(`b1/b11/fileA.txt`)
    })
  })

  describe('getUserStorageDirNodes', () => {
    it('ディレクトリを指定しない場合', async () => {
      const userDirPath = storageService.getUserStorageDirPath(GENERAL_USER)
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${userDirPath}/c1/c11/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${userDirPath}/c1/c12/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.getUserStorageDirNodes(GENERAL_USER)

      expect(actual.length).toBe(5)
      expect(actual[0].path).toBe(`c1`)
      expect(actual[1].path).toBe(`c1/c11`)
      expect(actual[2].path).toBe(`c1/c11/fileA.txt`)
      expect(actual[3].path).toBe(`c1/c12`)
      expect(actual[4].path).toBe(`c1/c12/fileB.txt`)
    })

    it('ディレクトリを指定した場合', async () => {
      const userDirPath = storageService.getUserStorageDirPath(GENERAL_USER)
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${userDirPath}/c1/c11/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${userDirPath}/c1/c12/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.getUserStorageDirNodes(GENERAL_USER, `c1/c11`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`c1`)
      expect(actual[1].path).toBe(`c1/c11`)
      expect(actual[2].path).toBe(`c1/c11/fileA.txt`)
    })
  })

  describe('createStorageDirs', () => {
    it('ベーシックケース', async () => {
      const actual = await storageService.createStorageDirs([
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

    it('basePathを指定した場合', async () => {
      const actual = await storageService.createStorageDirs([`d3`, `d1/d11`, `d1/d12`, `d2/d21`], `${TEST_FILES_DIR}`)

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
      const actual = await storageService.createStorageDirs([`/d3/`, `/d1/d11/`, `/d1/d12/`, `/d2/d21/`], `/${TEST_FILES_DIR}/`)

      expect(actual.length).toBe(6)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d12`)
      expect(actual[3].path).toBe(`d2`)
      expect(actual[4].path).toBe(`d2/d21`)
      expect(actual[5].path).toBe(`d3`)
      await existsNodes(actual, `/${TEST_FILES_DIR}/`)
    })
  })

  describe('createUserStorageDirs', () => {
    it('ベーシックケース', async () => {
      const actual = await storageService.createUserStorageDirs(GENERAL_USER, [`e3`, `e1/e11`, `e1/e12`, `e2/e21`])

      expect(actual.length).toBe(6)
      expect(actual[0].path).toBe(`e1`)
      expect(actual[1].path).toBe(`e1/e11`)
      expect(actual[2].path).toBe(`e1/e12`)
      expect(actual[3].path).toBe(`e2`)
      expect(actual[4].path).toBe(`e2/e21`)
      expect(actual[5].path).toBe(`e3`)
      const userDirPath = storageService.getUserStorageDirPath(GENERAL_USER)
      await existsNodes(actual, userDirPath)
    })
  })

  describe('removeStorageFiles', () => {
    it('ベーシックケース', async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/f1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/f2/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.removeStorageFiles([`${TEST_FILES_DIR}/f1/fileA.txt`, `${TEST_FILES_DIR}/f2/fileB.txt`])

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/f1/fileA.txt`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/f2/fileB.txt`)
      await notExistsNodes(actual)
    })

    it(`filePaths、basePathの先頭に'/'を付与`, async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/f1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/f2/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // パスの先頭に'/'を付与
      const actual = await storageService.removeStorageFiles([`/${TEST_FILES_DIR}/f1/fileA.txt`, `/${TEST_FILES_DIR}/f2/fileB.txt`])

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/f1/fileA.txt`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/f2/fileB.txt`)
      await notExistsNodes(actual)
    })

    it('basePathを指定した場合', async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/f1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/f2/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.removeStorageFiles([`f1/fileA.txt`, `f2/fileB.txt`], `${TEST_FILES_DIR}`)

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`f1/fileA.txt`)
      expect(actual[1].path).toBe(`f2/fileB.txt`)
      await notExistsNodes(actual)
    })

    it('存在しないファイルを指定', async () => {
      const actual = await storageService.removeStorageFiles([`${TEST_FILES_DIR}/f1/fileXXX.txt`])

      expect(actual.length).toBe(0)
    })
  })

  describe('removeUserStorageFiles', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserStorageDirPath(GENERAL_USER)

      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${userDirPath}/g1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${userDirPath}/g2/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.removeUserStorageFiles(GENERAL_USER, [`g1/fileA.txt`, `g2/fileB.txt`])

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`g1/fileA.txt`)
      expect(actual[1].path).toBe(`g2/fileB.txt`)
      await notExistsNodes(actual)
    })
  })

  describe('removeStorageDir', () => {
    it('ディレクトリがある場合', async () => {
      // ディレクトリを作成
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/h1`, `${TEST_FILES_DIR}/f2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/h1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/h1/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.removeStorageDir(`${TEST_FILES_DIR}/h1`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/h1`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/h1/fileA.txt`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/h1/fileB.txt`)
      await notExistsNodes(actual)
    })

    it('ディレクトリがない場合', async () => {
      // ディレクトリを作成せずファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/h1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/h1/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.removeStorageDir(`${TEST_FILES_DIR}/h1`)

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/h1/fileA.txt`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/h1/fileB.txt`)
      await notExistsNodes(actual)
    })

    it('存在しないディレクトリを指定した場合', async () => {
      const actual = await storageService.removeStorageDir(`${TEST_FILES_DIR}/h1`)

      expect(actual.length).toBe(0)
    })

    it(`dirPathの先頭・末尾に'/'を付与`, async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/h1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/h1/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // パスの先頭・末尾に'/'を付与
      const actual = await storageService.removeStorageDir(`/${TEST_FILES_DIR}/h1/`)

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/h1/fileA.txt`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/h1/fileB.txt`)
      await notExistsNodes(actual)
    })

    it('basePathを指定した場合', async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/h1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/h1/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.removeStorageDir(`h1`, `${TEST_FILES_DIR}`)

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`h1/fileA.txt`)
      expect(actual[1].path).toBe(`h1/fileB.txt`)
      await notExistsNodes(actual)
    })
  })

  describe('removeUserStorageDir', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserStorageDirPath(GENERAL_USER)

      // ディレクトリを作成
      await storageService.createStorageDirs([`${userDirPath}/i1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${userDirPath}/i1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${userDirPath}/i1/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.removeUserStorageDir(GENERAL_USER, `i1`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`i1`)
      expect(actual[1].path).toBe(`i1/fileA.txt`)
      expect(actual[2].path).toBe(`i1/fileB.txt`)
      await notExistsNodes(actual)
    })
  })

  describe('moveStorageDir', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/i1/i11`, `${TEST_FILES_DIR}/i2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/i1/i11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const fromDirNode = await storageService.getStorageDirNode(`${TEST_FILES_DIR}/i1`)
      const actual = await storageService.moveStorageDir(fromDirNode.path, `${TEST_FILES_DIR}/i2/i1`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/i2/i1`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/i2/i1/i11`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/i2/i1/i11/fileA.txt`)
      await existsNodes(actual)
      await notExistsNodes([fromDirNode])
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/i1/i11`, `${TEST_FILES_DIR}/i2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/i1/i11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const fromDirNode = await storageService.getStorageDirNode(`i1`, `${TEST_FILES_DIR}`)
      const actual = await storageService.moveStorageDir(fromDirNode.path, `i2/i1`, `${TEST_FILES_DIR}`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`i2/i1`)
      expect(actual[1].path).toBe(`i2/i1/i11`)
      expect(actual[2].path).toBe(`i2/i1/i11/fileA.txt`)
      await existsNodes(actual, `${TEST_FILES_DIR}`)
      await notExistsNodes([fromDirNode], `${TEST_FILES_DIR}`)
    })

    it(`basePathを指定した場合 - fromDirPath、toDirPath、basePathの先頭・末尾に'/'を付与`, async () => {
      // ディレクトリを作成
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/i1/i11`, `${TEST_FILES_DIR}/i2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/i1/i11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // パスの先頭・末尾に'/'を付与
      const fromDirNode = await storageService.getStorageDirNode(`/i1/`, `/${TEST_FILES_DIR}/`)
      const actual = await storageService.moveStorageDir(fromDirNode.path, `/i2/i1/`, `/${TEST_FILES_DIR}/`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`i2/i1`)
      expect(actual[1].path).toBe(`i2/i1/i11`)
      expect(actual[2].path).toBe(`i2/i1/i11/fileA.txt`)
      await existsNodes(actual, `${TEST_FILES_DIR}`)
      await notExistsNodes([fromDirNode], `${TEST_FILES_DIR}`)
    })

    it('移動元ディレクトリのサブディレクトリが実際には存在しない場合', async () => {
      // ディレクトリを作成
      // (移動元のサブディレクトリは作成しない)
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/i1`, `${TEST_FILES_DIR}/i2`])

      // ファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          // 'i11'といディレクトリは存在しないがアップロードはできる
          toFilePath: `${TEST_FILES_DIR}/i1/i11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const fromDirNode = await storageService.getStorageDirNode(`${TEST_FILES_DIR}/i1`)
      const actual = await storageService.moveStorageDir(fromDirNode.path, `${TEST_FILES_DIR}/i2/i1`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/i2/i1`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/i2/i1/i11`) // ← 移動元に存在しなかったディレクトリが作成されている
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/i2/i1/i11/fileA.txt`)
      await existsNodes(actual)
      await notExistsNodes([fromDirNode])
    })

    it('移動元ディレクトリが存在しない場合', async () => {
      // ディレクトリを作成
      // (移動元ディレクトリは作成しない)
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/i2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/i1/i11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      let actual: Error
      try {
        const fromDirNode = await storageService.getStorageDirNode(`${TEST_FILES_DIR}/i1`)
        await storageService.moveStorageDir(fromDirNode.path, `${TEST_FILES_DIR}/i2/i1`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The source directory does not exist: '${TEST_FILES_DIR}/i1'`)
    })

    it('移動先ディレクトリが存在しない場合', async () => {
      // ディレクトリを作成
      // (移動先ディレクトリは作成しない)
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/i1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/i1/i11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      let actual: Error
      try {
        const fromDirNode = await storageService.getStorageDirNode(`${TEST_FILES_DIR}/i1`)
        await storageService.moveStorageDir(fromDirNode.path, `${TEST_FILES_DIR}/i2/i1`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The destination directory does not exist: '${TEST_FILES_DIR}/i2'`)
    })

    it('移動先ディレクトリが移動元のサブディレクトリの場合', async () => {
      // ディレクトリを作成
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/i1`, `${TEST_FILES_DIR}/i2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/i1/i11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      let actual: Error
      try {
        const fromDirNode = await storageService.getStorageDirNode(`${TEST_FILES_DIR}/i1`)
        await storageService.moveStorageDir(fromDirNode.path, `${TEST_FILES_DIR}/i1/aaa/bbb/i1`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The destination directory is its own subdirectory: '${TEST_FILES_DIR}/i1' -> '${TEST_FILES_DIR}/i1/aaa/bbb/i1'`)
    })

    it(`移動先ディレクトリが移動元のサブディレクトリの場合 - fromDirPath、toDirPathの先頭・末尾に'/'を付与`, async () => {
      // ディレクトリを作成
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/i1`, `${TEST_FILES_DIR}/i2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/i1/i11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      let actual: Error
      try {
        // パスの先頭・末尾に'/'を付与
        const fromDirNode = await storageService.getStorageDirNode(`/${TEST_FILES_DIR}/i1/`)
        await storageService.moveStorageDir(fromDirNode.path, `/${TEST_FILES_DIR}/i1/aaa/bbb/i1/`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The destination directory is its own subdirectory: '${TEST_FILES_DIR}/i1' -> '${TEST_FILES_DIR}/i1/aaa/bbb/i1'`)
    })
  })

  describe('moveUserStorageDir', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserStorageDirPath(GENERAL_USER)

      // ディレクトリを作成
      await storageService.createStorageDirs([`${userDirPath}/i1/i11`, `${userDirPath}/i2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${userDirPath}/i1/i11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const fromDirNode = await storageService.getStorageDirNode(`i1`, `${userDirPath}`)
      const actual = await storageService.moveStorageDir(fromDirNode.path, `i2/i1`, `${userDirPath}`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`i2/i1`)
      expect(actual[1].path).toBe(`i2/i1/i11`)
      expect(actual[2].path).toBe(`i2/i1/i11/fileA.txt`)
      await existsNodes(actual, `${userDirPath}`)
      await notExistsNodes([fromDirNode])
    })
  })

  describe('moveStorageFile', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/i1`, `${TEST_FILES_DIR}/i2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/i1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const fromFileNode = await storageService.getStorageFileNode(`${TEST_FILES_DIR}/i1/fileA.txt`)
      const actual = await storageService.moveStorageFile(fromFileNode.path, `${TEST_FILES_DIR}/i2/fileA.txt`)

      expect(actual!.path).toBe(`${TEST_FILES_DIR}/i2/fileA.txt`)
      await existsNodes([actual!])
      await notExistsNodes([fromFileNode])
    })

    it('移動元ファイルがない場合', async () => {
      let actual: Error
      try {
        const fromFileNode = await storageService.getStorageFileNode(`${TEST_FILES_DIR}/i1/fileA.txt`)
        await storageService.moveStorageFile(fromFileNode.path, `${TEST_FILES_DIR}/i2/fileA.txt`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The source file does not exist: '${TEST_FILES_DIR}/i1/fileA.txt'`)
    })

    it('移動先ディレクトリがない場合', async () => {
      // ディレクトリを作成
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/i1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/i1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      let actual: Error
      try {
        const fromFileNode = await storageService.getStorageFileNode(`${TEST_FILES_DIR}/i1/fileA.txt`)
        await storageService.moveStorageFile(fromFileNode.path, `${TEST_FILES_DIR}/i2/fileA.txt`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The destination directory does not exist: '${TEST_FILES_DIR}/i2'`)
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/i1`, `${TEST_FILES_DIR}/i2`])

      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/i1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const fromFileNode = await storageService.getStorageFileNode(`i1/fileA.txt`, `${TEST_FILES_DIR}`)
      const actual = await storageService.moveStorageFile(fromFileNode.path, `i2/fileA.txt`, `${TEST_FILES_DIR}`)

      expect(actual!.path).toBe(`i2/fileA.txt`)
      await existsNodes([actual!], `${TEST_FILES_DIR}`)
      await notExistsNodes([fromFileNode], `${TEST_FILES_DIR}`)
    })

    it(`filePath、toFilePath、basePathの先頭・末尾に'/'を付与した場合`, async () => {
      // ディレクトリを作成
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/i1`, `${TEST_FILES_DIR}/i2`])

      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/i1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // パスの先頭・末尾に'/'を付与
      const fromFileNode = await storageService.getStorageFileNode(`/i1/fileA.txt/`, `/${TEST_FILES_DIR}/`)
      const actual = await storageService.moveStorageFile(fromFileNode.path, `/i2/fileA.txt/`, `/${TEST_FILES_DIR}/`)

      expect(actual!.path).toBe(`i2/fileA.txt`)
      await existsNodes([actual!], `/${TEST_FILES_DIR}/`)
      await notExistsNodes([fromFileNode], `/${TEST_FILES_DIR}/`)
    })
  })

  describe('moveUserStorageFile', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserStorageDirPath(GENERAL_USER)

      // ディレクトリを作成
      await storageService.createStorageDirs([`${userDirPath}/i1`, `${userDirPath}/i2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${userDirPath}/i1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const fromFileNode = await storageService.getStorageFileNode(`i1/fileA.txt`, userDirPath)
      const actual = await storageService.moveUserStorageFile(GENERAL_USER, `i1/fileA.txt`, `i2/fileA.txt`)

      await existsNodes([actual!], userDirPath)
      await notExistsNodes([fromFileNode], userDirPath)
    })
  })

  describe('renameStorageDir', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/i1/i11`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/i1/i11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const dirNode = await storageService.getStorageDirNode(`${TEST_FILES_DIR}/i1`)
      const actual = await storageService.renameStorageDir(dirNode.path, `i2`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/i2`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/i2/i11`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/i2/i11/fileA.txt`)
      await existsNodes(actual)
      await notExistsNodes([dirNode])
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/i1/i11`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/i1/i11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const dirNode = await storageService.getStorageDirNode(`i1`, `${TEST_FILES_DIR}`)
      const actual = await storageService.renameStorageDir(dirNode.path, `i2`, `${TEST_FILES_DIR}`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`i2`)
      expect(actual[1].path).toBe(`i2/i11`)
      expect(actual[2].path).toBe(`i2/i11/fileA.txt`)
      await existsNodes(actual, `${TEST_FILES_DIR}`)
      await notExistsNodes([dirNode], `${TEST_FILES_DIR}`)
    })

    it(`basePathを指定した場合 - パスの先頭・末尾に'/'を付与`, async () => {
      // ディレクトリを作成
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/i1/i11`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/i1/i11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // パスの先頭・末尾に'/'を付与
      const dirNode = await storageService.getStorageDirNode(`/i1/`, `/${TEST_FILES_DIR}/`)
      const actual = await storageService.renameStorageDir(dirNode.path, `i2`, `/${TEST_FILES_DIR}/`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`i2`)
      expect(actual[1].path).toBe(`i2/i11`)
      expect(actual[2].path).toBe(`i2/i11/fileA.txt`)
      await existsNodes(actual, `${TEST_FILES_DIR}`)
      await notExistsNodes([dirNode], `${TEST_FILES_DIR}`)
    })

    it('ディレクトリパスにディレクトリ名と同じディレクトリがあった場合', async () => {
      // ディレクトリを作成
      // あえて'i1/i1'というディレクトリを作成
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/i1/i1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          // あえて'i1/i1'というディレクトリにファイルを配置
          toFilePath: `${TEST_FILES_DIR}/i1/i1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const dirNode = await storageService.getStorageDirNode(`${TEST_FILES_DIR}/i1/i1`)
      const actual = await storageService.renameStorageDir(dirNode.path, `i2`)

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/i1/i2`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/i1/i2/fileA.txt`)
      await existsNodes(actual)
      await notExistsNodes([dirNode])
    })
  })

  describe('renameUserStorageDir', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserStorageDirPath(GENERAL_USER)

      // ディレクトリを作成
      await storageService.createStorageDirs([`${userDirPath}/i1/i11`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${userDirPath}/i1/i11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const dirNode = await storageService.getStorageDirNode(`i1`, `${userDirPath}`)
      const actual = await storageService.renameStorageDir(dirNode.path, `i2`, `${userDirPath}`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`i2`)
      expect(actual[1].path).toBe(`i2/i11`)
      expect(actual[2].path).toBe(`i2/i11/fileA.txt`)
      await existsNodes(actual, `${userDirPath}`)
      await notExistsNodes([dirNode])
    })
  })

  describe('renameStorageFile', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/i1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/i1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const fromFileNode = await storageService.getStorageFileNode(`${TEST_FILES_DIR}/i1/fileA.txt`)
      const actual = await storageService.renameStorageFile(fromFileNode.path, 'fileB.txt')

      expect(actual!.path).toBe(`${TEST_FILES_DIR}/i1/fileB.txt`)
      await existsNodes([actual!])
      await notExistsNodes([fromFileNode])
    })

    it('basePathを指定', async () => {
      // ディレクトリを作成
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/i1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/i1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const fileNode = await storageService.getStorageFileNode(`i1/fileA.txt`, `${TEST_FILES_DIR}`)
      const actual = await storageService.renameStorageFile(fileNode.path, 'fileB.txt', `${TEST_FILES_DIR}`)

      expect(actual!.path).toBe(`i1/fileB.txt`)
      await existsNodes([actual!], `${TEST_FILES_DIR}`)
      await notExistsNodes([fileNode], `${TEST_FILES_DIR}`)
    })

    it(`basePathを指定 - パスの先頭・末尾に'/'を付与`, async () => {
      // ディレクトリを作成
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/i1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/i1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // パスの先頭・末尾に'/'を付与
      const fileNode = await storageService.getStorageFileNode(`/i1/fileA.txt/`, `/${TEST_FILES_DIR}/`)
      const actual = await storageService.renameStorageFile(fileNode.path, 'fileB.txt', `/${TEST_FILES_DIR}/`)

      expect(actual!.path).toBe(`i1/fileB.txt`)
      await existsNodes([actual!], `${TEST_FILES_DIR}`)
      await notExistsNodes([fileNode], `${TEST_FILES_DIR}`)
    })

    it('ファイルパスにファイル名と同じディレクトリがあった場合', async () => {
      // ディレクトリを作成
      // あえて'i1/fileA.txt'というディレクトリを作成
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/i1/fileA.txt`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          // あえて'i1/fileA.txt'というディレクトリに'fileA.txt'というファイルを配置
          toFilePath: `${TEST_FILES_DIR}/i1/fileA.txt/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const fileNode = await storageService.getStorageFileNode(`${TEST_FILES_DIR}/i1/fileA.txt/fileA.txt`)
      const actual = await storageService.renameStorageFile(fileNode.path, 'fileB.txt')

      // 'fileA.txt'というディレクトリ名は変わらず、
      // 'fileA.txt'が'fileB.txt'に名前変更されたことを確認
      expect(actual!.path).toBe(`${TEST_FILES_DIR}/i1/fileA.txt/fileB.txt`)
      await existsNodes([actual!])
      await notExistsNodes([fileNode])
    })
  })

  describe('renameUserStorageFile', () => {
    it('ベーシックケース', async () => {
      const userDirPath = storageService.getUserStorageDirPath(GENERAL_USER)

      // ディレクトリを作成
      await storageService.createStorageDirs([`${userDirPath}/i1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${userDirPath}/i1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const fromFileNode = await storageService.getStorageFileNode(`i1/fileA.txt`, `${userDirPath}`)
      const actual = await storageService.renameUserStorageFile(GENERAL_USER, fromFileNode.path, 'fileB.txt')

      expect(actual!.path).toBe(`i1/fileB.txt`)
      await existsNodes([actual!], `${userDirPath}`)
      await notExistsNodes([fromFileNode], `${userDirPath}`)
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

  describe('getStorageNodeMap', () => {
    it('ディレクトリを作成した場合', async () => {
      // ディレクトリを作成
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/k1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/k1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/k1/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.getStorageNodeMap(`${TEST_FILES_DIR}/k1`)

      expect(Object.keys(actual).length).toBe(3)
      expect(actual[`${TEST_FILES_DIR}/k1`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/k1/fileA.txt`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/k1/fileB.txt`].exists).toBeTruthy()
    })

    it('ディレクトリを作成しなかった場合', async () => {
      // ディレクトリを作成せずファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/k1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/k1/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.getStorageNodeMap(`${TEST_FILES_DIR}/k1`)

      expect(Object.keys(actual).length).toBe(2)
      expect(actual[`${TEST_FILES_DIR}/k1/fileA.txt`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/k1/fileB.txt`].exists).toBeTruthy()
    })

    it('dirPathを指定せず、basePathを指定した場合', async () => {
      // ディレクトリを作成せずファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/k1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/k1/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.getStorageNodeMap(undefined, `${TEST_FILES_DIR}`)

      expect(Object.keys(actual).length).toBe(2)
      expect(actual[`k1/fileA.txt`].exists).toBeTruthy()
      expect(actual[`k1/fileB.txt`].exists).toBeTruthy()
    })

    it(`dirPath、basePathの先頭・末尾に'/'を付与した場合`, async () => {
      // ディレクトリを作成せずファイルをアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/k1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/k1/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // パスの先頭・末尾に'/'を付与
      const actual = await storageService.getStorageNodeMap(`/k1/`, `/${TEST_FILES_DIR}/`)

      expect(Object.keys(actual).length).toBe(2)
      expect(actual[`k1/fileA.txt`].exists).toBeTruthy()
      expect(actual[`k1/fileB.txt`].exists).toBeTruthy()
    })
  })

  describe('getStorageNode', () => {
    it('ディレクトリの取得', async () => {
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/k1`])

      const actual = await storageService.getStorageNode(`${TEST_FILES_DIR}/k1/`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/k1`)
      expect(actual.exists).toBeTruthy()
      await existsNodes([actual])
    })

    it('ディレクトリの取得 - basePathを指定', async () => {
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/k1`])

      const actual = await storageService.getStorageNode(`k1/`, `${TEST_FILES_DIR}`)

      expect(actual.path).toBe(`k1`)
      expect(actual.exists).toBeTruthy()
      await existsNodes([actual], `${TEST_FILES_DIR}`)
    })

    it(`ディレクトリの取得 - basePathを指定 - パスの先頭・末尾に'/'を付与`, async () => {
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/k1`])

      const actual = await storageService.getStorageNode(`/k1/`, `/${TEST_FILES_DIR}/`)

      expect(actual.path).toBe(`k1`)
      expect(actual.exists).toBeTruthy()
      await existsNodes([actual], `${TEST_FILES_DIR}`)
    })

    it(`ディレクトリの取得 - 引数のパス指定で末尾に'/'を付与しない場合`, async () => {
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/k1`])

      // 末尾に'/'を付与しない
      const actual = await storageService.getStorageNode(`${TEST_FILES_DIR}/k1`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/k1`)
      // 末尾に'/'を付与しなかったので存在しなことになってしまう
      expect(actual.exists).toBeFalsy()
    })

    it('ファイルの取得', async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/k1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.getStorageNode(`${TEST_FILES_DIR}/k1/fileA.txt`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/k1/fileA.txt`)
      expect(actual.exists).toBeTruthy()
      await existsNodes([actual])
    })

    it('ファイルの取得 - basePathを指定', async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/k1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.getStorageNode(`k1/fileA.txt`, `${TEST_FILES_DIR}`)

      expect(actual.path).toBe(`k1/fileA.txt`)
      expect(actual.exists).toBeTruthy()
      await existsNodes([actual], `${TEST_FILES_DIR}`)
    })

    it(`ファイルの取得 - basePathを指定 - パスの先頭・末尾に'/'を付与`, async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/k1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // パスの先頭・末尾に'/'を付与
      const actual = await storageService.getStorageNode(`/k1/fileA.txt`, `/${TEST_FILES_DIR}/`)

      expect(actual.path).toBe(`k1/fileA.txt`)
      expect(actual.exists).toBeTruthy()
      await existsNodes([actual], `${TEST_FILES_DIR}`)
    })
  })

  describe('getStorageDirNode', () => {
    it('ベーシックケース', async () => {
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/k1`])

      const actual = await storageService.getStorageDirNode(`${TEST_FILES_DIR}/k1`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/k1`)
      expect(actual.exists).toBeTruthy()
      await existsNodes([actual])
    })

    it(`dirPathの先頭・末尾に'/'を付与`, async () => {
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/k1`])

      // パスの先頭・末尾に'/'を付与
      const actual = await storageService.getStorageDirNode(`/${TEST_FILES_DIR}/k1/`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/k1`)
      expect(actual.exists).toBeTruthy()
      await existsNodes([actual])
    })
  })

  describe('getStorageFileNode', () => {
    it('ベーシックケース', async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/k1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      const actual = await storageService.getStorageFileNode(`${TEST_FILES_DIR}/k1/fileA.txt`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/k1/fileA.txt`)
      expect(actual.exists).toBeTruthy()
      await existsNodes([actual])
    })

    it(`filePathの先頭に'/'を付与`, async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/k1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // パスの先頭に'/'を付与
      const actual = await storageService.getStorageFileNode(`/${TEST_FILES_DIR}/k1/fileA.txt`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/k1/fileA.txt`)
      expect(actual.exists).toBeTruthy()
      await existsNodes([actual])
    })
  })

  describe('toStorageNode', () => {
    it('ディレクトリノードの変換', async () => {
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/l1`])
      const nodeMap = await storageService.getStorageNodeMap(`${TEST_FILES_DIR}/l1`)

      const actual = storageService.toStorageNode(nodeMap[`${TEST_FILES_DIR}/l1`].gcsNode!)

      expect(actual.nodeType).toBe(StorageNodeType.Dir)
      expect(actual.name).toBe(`l1`)
      expect(actual.dir).toBe(`${TEST_FILES_DIR}`)
      expect(actual.path).toBe(`${TEST_FILES_DIR}/l1`)
      expect(dayjs(actual.created).isValid()).toBeTruthy()
      expect(dayjs(actual.updated).isValid()).toBeTruthy()
      expect(actual.exists).toBeTruthy()
      expect(actual.gcsNode).toBeDefined()
    })

    it('ファイルノードの変換', async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/l1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)
      const nodeMap = await storageService.getStorageNodeMap(`${TEST_FILES_DIR}/l1`)

      const actual = storageService.toStorageNode(nodeMap[`${TEST_FILES_DIR}/l1/fileA.txt`].gcsNode!)

      expect(actual.nodeType).toBe(StorageNodeType.File)
      expect(actual.name).toBe(`fileA.txt`)
      expect(actual.dir).toBe(`${TEST_FILES_DIR}/l1`)
      expect(actual.path).toBe(`${TEST_FILES_DIR}/l1/fileA.txt`)
      expect(dayjs(actual.created).isValid()).toBeTruthy()
      expect(dayjs(actual.updated).isValid()).toBeTruthy()
      expect(actual.exists).toBeTruthy()
      expect(actual.gcsNode).toBeDefined()
    })

    it('basePathを指定した場合', async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/l1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // gcsNodeを取得
      const nodeMap = await storageService.getStorageNodeMap(`${TEST_FILES_DIR}/l1`)

      const actual = storageService.toStorageNode(nodeMap[`${TEST_FILES_DIR}/l1/fileA.txt`].gcsNode!, `${TEST_FILES_DIR}`)

      expect(actual.nodeType).toBe(StorageNodeType.File)
      expect(actual.name).toBe(`fileA.txt`)
      expect(actual.dir).toBe(`l1`)
      expect(actual.path).toBe(`l1/fileA.txt`)
      expect(actual.exists).toBeTruthy()
      expect(actual.gcsNode).toBeDefined()
    })
  })

  describe('toDirStorageNode', () => {
    it('ベーシックケース', async () => {
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/m1`])
      const nodeMap = await storageService.getStorageNodeMap(`${TEST_FILES_DIR}/m1`)

      const actual = storageService.toDirStorageNode(`${TEST_FILES_DIR}/m1`)

      expect(actual.nodeType).toBe(StorageNodeType.Dir)
      expect(actual.name).toBe(`m1`)
      expect(actual.dir).toBe(`${TEST_FILES_DIR}`)
      expect(actual.path).toBe(`${TEST_FILES_DIR}/m1`)
      expect(actual.created).toBeUndefined()
      expect(actual.updated).toBeUndefined()
    })
  })

  describe('sortStorageNodes', () => {
    it('昇順でソート', async () => {
      const m1: StorageNode = { nodeType: StorageNodeType.Dir, name: 'm1', dir: '', path: 'm1' }
      const m11: StorageNode = { nodeType: StorageNodeType.Dir, name: 'm11', dir: 'm1', path: 'm1/m11' }
      const fileA: StorageNode = { nodeType: StorageNodeType.File, name: 'fileA.txt', dir: 'm1/m11', path: 'm1/m11/fileA.txt' }
      const m12: StorageNode = { nodeType: StorageNodeType.Dir, name: 'm12', dir: 'm1', path: 'm1/m12' }
      const fileB: StorageNode = { nodeType: StorageNodeType.File, name: 'fileB.txt', dir: 'm1/m12', path: 'm1/m12/fileB.txt' }
      const m2: StorageNode = { nodeType: StorageNodeType.Dir, name: 'm2', dir: '', path: 'm2' }
      const fileC: StorageNode = { nodeType: StorageNodeType.File, name: 'fileC.txt', dir: 'm2', path: 'm2/fileC.txt' }
      const fileD: StorageNode = { nodeType: StorageNodeType.File, name: 'fileD.txt', dir: '', path: 'fileD.txt' }
      const fileE: StorageNode = { nodeType: StorageNodeType.File, name: 'fileE.txt', dir: '', path: 'fileE.txt' }

      const nodes = [fileA, fileB, fileC, fileE, fileD, m1, m2, m11, m12]
      storageService.sortStorageNodes(nodes)

      expect(nodes[0]).toBe(m1)
      expect(nodes[1]).toBe(m11)
      expect(nodes[2]).toBe(fileA)
      expect(nodes[3]).toBe(m12)
      expect(nodes[4]).toBe(fileB)
      expect(nodes[5]).toBe(m2)
      expect(nodes[6]).toBe(fileC)
      expect(nodes[7]).toBe(fileD)
      expect(nodes[8]).toBe(fileE)
    })
  })

  describe('getUserStorageDirPath', () => {
    it('ベーシックケース - user.storageDir', async () => {
      const actual = storageService.getUserStorageDirPath(GENERAL_USER)
      expect(actual).toBe(`users/${GENERAL_USER.storageDir}`)
    })

    it('ベーシックケース - user.customClaims.storageDir', async () => {
      const user = {
        uid: GENERAL_USER.uid,
        customClaims: {
          storageDir: GENERAL_USER.storageDir,
        },
      }

      const actual = storageService.getUserStorageDirPath(user)
      expect(actual).toBe(`users/${user.customClaims.storageDir}`)
    })

    it('user.storageDirが設定されていない場合', async () => {
      const user = cloneDeep(GENERAL_USER)
      user.storageDir = undefined

      let actual!: Error
      try {
        storageService.getUserStorageDirPath(user)
      } catch (err) {
        actual = err
      }

      expect(actual).toBeDefined()
    })

    it('user.customClaims.storageDirが設定されていない場合', async () => {
      const user = {
        uid: GENERAL_USER.uid,
        customClaims: {
          storageDir: undefined,
        },
      }

      let actual!: Error
      try {
        storageService.getUserStorageDirPath(user)
      } catch (err) {
        actual = err
      }

      expect(actual).toBeDefined()
    })
  })

  describe('padVirtualDirNode', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createStorageDirs([`${TEST_FILES_DIR}/p1`])

      // ファイルのアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/p1/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/p2/p21/fileB.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileC.txt`,
          toFilePath: `${TEST_FILES_DIR}/fileC.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)
      const actual = await storageService.getStorageNodeMap(`${TEST_FILES_DIR}`)

      storageService.padVirtualDirNode(actual)

      expect(Object.keys(actual).length).toBe(7)
      expect(actual[`${TEST_FILES_DIR}`].path).toBe(`${TEST_FILES_DIR}`)
      expect(actual[`${TEST_FILES_DIR}/p1`].path).toBe(`${TEST_FILES_DIR}/p1`)
      expect(actual[`${TEST_FILES_DIR}/p1/fileA.txt`].path).toBe(`${TEST_FILES_DIR}/p1/fileA.txt`)
      expect(actual[`${TEST_FILES_DIR}/p2`].path).toBe(`${TEST_FILES_DIR}/p2`)
      expect(actual[`${TEST_FILES_DIR}/p2/p21`].path).toBe(`${TEST_FILES_DIR}/p2/p21`)
      expect(actual[`${TEST_FILES_DIR}/p2/p21/fileB.txt`].path).toBe(`${TEST_FILES_DIR}/p2/p21/fileB.txt`)
      expect(actual[`${TEST_FILES_DIR}/fileC.txt`].path).toBe(`${TEST_FILES_DIR}/fileC.txt`)

      expect(actual[`${TEST_FILES_DIR}`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/p1`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/p1/fileA.txt`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/p2`].exists).toBeFalsy() // ← 仮想的にディレクトリが作成された
      expect(actual[`${TEST_FILES_DIR}/p2/p21`].exists).toBeFalsy() // ← 仮想的にディレクトリが作成された
      expect(actual[`${TEST_FILES_DIR}/p2/p21/fileB.txt`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/fileC.txt`].exists).toBeTruthy()
    })

    it('basePathを指定した場合', async () => {
      // ファイルのアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/p1/p11/fileA.txt`,
        },
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileB.txt`,
          toFilePath: `${TEST_FILES_DIR}/p1/p12/fileB.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)
      const actual = await storageService.getStorageNodeMap(`${TEST_FILES_DIR}`)

      storageService.padVirtualDirNode(actual, `${TEST_FILES_DIR}/p1`)

      expect(Object.keys(actual).length).toBe(5)
      expect(actual[`${TEST_FILES_DIR}/p1`].path).toBe(`${TEST_FILES_DIR}/p1`)
      expect(actual[`${TEST_FILES_DIR}/p1/p11`].path).toBe(`${TEST_FILES_DIR}/p1/p11`)
      expect(actual[`${TEST_FILES_DIR}/p1/p11/fileA.txt`].path).toBe(`${TEST_FILES_DIR}/p1/p11/fileA.txt`)
      expect(actual[`${TEST_FILES_DIR}/p1/p12`].path).toBe(`${TEST_FILES_DIR}/p1/p12`)
      expect(actual[`${TEST_FILES_DIR}/p1/p12/fileB.txt`].path).toBe(`${TEST_FILES_DIR}/p1/p12/fileB.txt`)

      expect(actual[`${TEST_FILES_DIR}/p1`].exists).toBeFalsy()
      expect(actual[`${TEST_FILES_DIR}/p1/p11`].exists).toBeFalsy()
      expect(actual[`${TEST_FILES_DIR}/p1/p11/fileA.txt`].exists).toBeTruthy()
      expect(actual[`${TEST_FILES_DIR}/p1/p12`].exists).toBeFalsy()
      expect(actual[`${TEST_FILES_DIR}/p1/p12/fileB.txt`].exists).toBeTruthy()
    })

    it(`basePathの先頭・末尾に'/'を付与`, async () => {
      // ファイルのアップロード
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `${TEST_FILES_DIR}/p1/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)
      const actual = await storageService.getStorageNodeMap(`${TEST_FILES_DIR}`)

      // パスの先頭・末尾に'/'を付与
      storageService.padVirtualDirNode(actual, `/${TEST_FILES_DIR}/p1/`)

      expect(Object.keys(actual).length).toBe(2)
      expect(actual[`${TEST_FILES_DIR}/p1`].path).toBe(`${TEST_FILES_DIR}/p1`)
      expect(actual[`${TEST_FILES_DIR}/p1/fileA.txt`].path).toBe(`${TEST_FILES_DIR}/p1/fileA.txt`)

      expect(actual[`${TEST_FILES_DIR}/p1`].exists).toBeFalsy()
      expect(actual[`${TEST_FILES_DIR}/p1/fileA.txt`].exists).toBeTruthy
    })
  })

  describe('splitHierarchicalDirPaths', () => {
    it('ベーシックケース', async () => {
      const actual = storageService.splitHierarchicalDirPaths(`q1`, `q1/q11/fileA.txt`, `q1/q11/fileB.txt`, 'q2/q21/fileC.txt')

      expect(actual.length).toBe(7)
      expect(actual[0]).toBe(`q1`)
      expect(actual[1]).toBe(`q1/q11`)
      expect(actual[2]).toBe(`q1/q11/fileA.txt`)
      expect(actual[3]).toBe(`q1/q11/fileB.txt`)
      expect(actual[4]).toBe(`q2`)
      expect(actual[5]).toBe(`q2/q21`)
      expect(actual[6]).toBe(`q2/q21/fileC.txt`)
    })
  })
})
