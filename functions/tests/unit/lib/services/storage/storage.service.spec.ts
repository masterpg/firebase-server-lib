import * as admin from 'firebase-admin'
import * as fs from 'fs'
import * as path from 'path'
import {
  FirestoreServiceDI,
  SignedUploadUrlInput,
  StorageNode,
  StorageNodeType,
  UploadDataItem,
  config,
  initFirebaseApp,
} from '../../../../../src/lib'
import { MockBaseAppModule, MockDevUtilsServiceDI, MockRESTContainerModule, MockStorageServiceDI } from '../../../../mocks/lib'
import { Test, TestingModule } from '@nestjs/testing'
import { Module } from '@nestjs/common'
import { Response } from 'supertest'
import { removeBothEndsSlash } from 'web-base-lib'
const dayjs = require('dayjs')
const request = require('supertest')

jest.setTimeout(25000)
initFirebaseApp()

const GENERAL_USER = { uid: 'yamada.one' }
const TEST_FILES_DIR = 'test-files'

async function existsNodes(nodes: StorageNode[], basePath = ''): Promise<void> {
  const bucket = admin.storage().bucket()
  for (const node of nodes) {
    let nodePath = basePath ? `${removeBothEndsSlash(basePath)}/${node.path}` : node.path
    nodePath += node.nodeType === StorageNodeType.Dir ? '/' : ''
    const gcsNode = bucket.file(nodePath)
    const exists = (await gcsNode.exists())[0]
    expect(exists).toBeTruthy()
  }
}

async function notExistsNodes(nodes: StorageNode[], basePath = ''): Promise<void> {
  const bucket = admin.storage().bucket()
  for (const node of nodes) {
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

  describe('uploadLocalFiles', () => {
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

    it('単一ファイルをアップロード - toFilePathの先頭に"/"を付与', async () => {
      const localFilePath = `${__dirname}/${TEST_FILES_DIR}/fileA.txt`
      const toFilePath = `/${TEST_FILES_DIR}/fileA.txt` // ← 先頭に"/"を付与

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
      expect(toDirNodes[1].path).toBe(uploadList[0].toFilePath)
      expect(toDirNodes[2].path).toBe(uploadList[1].toFilePath)
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
      expect(actual[3].path).toBe(`fileC.txt`)
    })

    it('dirPath、basePathの先頭・末尾に"/"を付与', async () => {
      const uploadList = [
        {
          localFilePath: `${__dirname}/${TEST_FILES_DIR}/fileA.txt`,
          toFilePath: `/${TEST_FILES_DIR}/b1/b11/fileA.txt`,
        },
      ]
      await storageService.uploadLocalFiles(uploadList)

      // パスの先頭・末尾に"/"を付与
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

    it('dirPaths、basePathの先頭・末尾に"/"を付与', async () => {
      // パスの先頭・末尾に"/"を付与
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

    it('filePathsの先頭に"/"を付与', async () => {
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

      // パスの先頭に"/"を付与
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
    it('ディレクトリを作成した場合', async () => {
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

    it('ディレクトリを作成しない場合', async () => {
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

    it('dirPathの先頭に"/"を付与', async () => {
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

      // パスの先頭・末尾に"/"を付与
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
      await storageService.createStorageDirs([`${userDirPath}/i1`, `${userDirPath}/g2`])

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
      expect(actual[`${TEST_FILES_DIR}/k1`]).toBeDefined()
      expect(actual[`${TEST_FILES_DIR}/k1/fileA.txt`]).toBeDefined()
      expect(actual[`${TEST_FILES_DIR}/k1/fileB.txt`]).toBeDefined()
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
      expect(actual[`${TEST_FILES_DIR}/k1/fileA.txt`]).toBeDefined()
      expect(actual[`${TEST_FILES_DIR}/k1/fileB.txt`]).toBeDefined()
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
      expect(actual[`k1/fileA.txt`]).toBeDefined()
      expect(actual[`k1/fileB.txt`]).toBeDefined()
    })

    it('dirPathの先頭に"/"を付与した場合', async () => {
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

      const actual = await storageService.getStorageNodeMap(`/${TEST_FILES_DIR}`)

      expect(Object.keys(actual).length).toBe(2)
      expect(actual[`${TEST_FILES_DIR}/k1/fileA.txt`]).toBeDefined()
      expect(actual[`${TEST_FILES_DIR}/k1/fileB.txt`]).toBeDefined()
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
    it('ベーシックケース', async () => {
      const actual = storageService.getUserStorageDirPath(GENERAL_USER)
      expect(actual).toBe(`users/${GENERAL_USER.uid}`)
    })
  })

  describe('padVirtualDirNode', () => {
    it('ベーシックケース', async () => {
      const fileA: StorageNode = {
        nodeType: StorageNodeType.File,
        name: 'fileA.txt',
        dir: 'p1/p11',
        path: 'p1/p11/fileA.txt',
      }
      const fileB: StorageNode = {
        nodeType: StorageNodeType.File,
        name: 'fileB.txt',
        dir: 'p2/p21',
        path: 'p2/p21/fileB.txt',
      }
      const fileC: StorageNode = {
        nodeType: StorageNodeType.File,
        name: 'fileC.txt',
        dir: 'p2',
        path: 'p2/fileC.txt',
      }
      const fileD: StorageNode = {
        nodeType: StorageNodeType.File,
        name: 'fileD.txt',
        dir: '',
        path: 'fileD.txt',
      }

      const actual = {
        [fileA.path]: fileA,
        [fileB.path]: fileB,
        [fileC.path]: fileC,
        [fileD.path]: fileD,
      }

      storageService.padVirtualDirNode(actual)

      expect(Object.keys(actual).length).toBe(8)
      expect(actual[`p1`].path).toBe(`p1`)
      expect(actual[`p1/p11`].path).toBe(`p1/p11`)
      expect(actual[`p1/p11/fileA.txt`].path).toBe(`p1/p11/fileA.txt`)
      expect(actual[`p2`].path).toBe(`p2`)
      expect(actual[`p2/p21`].path).toBe(`p2/p21`)
      expect(actual[`p2/p21/fileB.txt`].path).toBe(`p2/p21/fileB.txt`)
      expect(actual[`p2/fileC.txt`].path).toBe(`p2/fileC.txt`)
      expect(actual[`fileD.txt`].path).toBe(`fileD.txt`)
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
