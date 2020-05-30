import * as admin from 'firebase-admin'
import { APP_ADMIN_USER, APP_ADMIN_USER_HEADER, STORAGE_USER, STORAGE_USER_HEADER, STORAGE_USER_TOKEN } from '../../../../helpers/common/data'
import { DevUtilsServiceDI, DevUtilsServiceModule, StorageServiceDI, StorageUploadDataItem, initLib } from '../../../../../src/lib'
import { Test, TestingModule } from '@nestjs/testing'
import { MockStorageRESTModule } from '../../../../mocks/lib/rest/storage'
import { Response } from 'supertest'
import { cloneDeep } from 'lodash'
import request = require('supertest')

jest.setTimeout(25000)
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

let testingModule: TestingModule
let storageService!: StorageServiceDI.type
let devUtilsService!: DevUtilsServiceDI.type

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

beforeAll(async () => {
  const testingModule = await Test.createTestingModule({
    imports: [DevUtilsServiceModule],
  }).compile()

  devUtilsService = testingModule.get<DevUtilsServiceDI.type>(DevUtilsServiceDI.symbol)
  await devUtilsService.setTestFirebaseUsers(APP_ADMIN_USER, STORAGE_USER)
})

describe('StorageService', () => {
  beforeEach(async () => {
    testingModule = await Test.createTestingModule({
      imports: [MockStorageRESTModule],
    }).compile()

    storageService = testingModule.get<StorageServiceDI.type>(StorageServiceDI.symbol)

    await storageService.removeDir(null, `${TEST_FILES_DIR}`)
    await storageService.removeDir(null, `${storageService.getUserDirPath(STORAGE_USER_TOKEN)}`)

    // Cloud Storageで短い間隔のノード追加・削除を行うとエラーが発生するので間隔調整している
    await sleep(2000)
  })

  /**
   * TODO Jest did not exit one second after the test run has completed.
   *  admin.auth()の非同期メソッド`getUser()`などを実行すると上記警告が発生しJestが終了しない
   */
  describe('assignUserDir', () => {
    beforeEach(async () => {
      await devUtilsService.setTestFirebaseUsers(STORAGE_USER)
    })

    it('ベーシックケース', async () => {
      // ユーザーディレクトリ未設定として実行
      await storageService.assignUserDir({
        uid: STORAGE_USER_TOKEN.uid,
        myDirName: undefined,
      })

      expect(true).toBeTruthy()

      const afterUser = await admin.auth().getUser(STORAGE_USER_TOKEN.uid)
      // カスタムクレイムのユーザーディレクトリ名が設定されたか検証
      expect((afterUser.customClaims as any).myDirName).toBeDefined()
      // ユーザーディレクトリが作成されたか検証
      const userDirPath = storageService.getUserDirPath({
        uid: STORAGE_USER_TOKEN.uid,
        ...afterUser.customClaims,
      })
      const userDirNode = await storageService.getRealDirNode(null, userDirPath)
      expect(userDirNode.exists).toBeTruthy()
    })

    it('カスタムクレイムにユーザーディレクトリ名が割り当てられてられているが、ユーザーディレクトリは存在しない場合', async () => {
      await storageService.assignUserDir(STORAGE_USER_TOKEN)

      const afterUser = await admin.auth().getUser(STORAGE_USER_TOKEN.uid)
      // カスタムクレイムのユーザーディレクトリ名に変化がないことを検証
      expect((afterUser.customClaims as any).myDirName).toBe(STORAGE_USER_TOKEN.myDirName)
      // ユーザーディレクトリが作成されたか検証
      const userDirPath = storageService.getUserDirPath({
        uid: STORAGE_USER_TOKEN.uid,
        ...afterUser.customClaims,
      })
      const userDirNode = await storageService.getRealDirNode(null, userDirPath)
      expect(userDirNode.exists).toBeTruthy()
    })

    it('カスタムクレイムにユーザーディレクトリ名が割り当てられていて、かつユーザーディレクトリも存在する場合', async () => {
      // ユーザーディレクトリを作成
      const beforeUserDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const beforeUserDirNode = (await storageService.createDirs(null, [beforeUserDirPath]))[0]

      await storageService.assignUserDir(STORAGE_USER_TOKEN)

      const afterUser = await admin.auth().getUser(STORAGE_USER_TOKEN.uid)
      // カスタムクレイムのユーザーディレクトリ名に変化がないことを検証
      expect((afterUser.customClaims as any).myDirName).toBe(STORAGE_USER_TOKEN.myDirName)
      // ユーザーディレクトリに変化がないことを検証
      const afterUserDirPath = storageService.getUserDirPath({
        uid: STORAGE_USER_TOKEN.uid,
        ...afterUser.customClaims,
      })
      expect(afterUserDirPath).toBe(beforeUserDirPath)
      const afterUserDirNode = await storageService.getRealDirNode(null, afterUserDirPath)
      expect(afterUserDirNode.created).toEqual(beforeUserDirNode.created)
    })
  })

  describe('getUserDirPath', () => {
    it('ベーシックケース', async () => {
      const actual = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      expect(actual).toBe(`users/${STORAGE_USER_TOKEN.myDirName}`)
    })

    it('myDirNameが設定されていない場合', async () => {
      const user = cloneDeep(STORAGE_USER_TOKEN)
      user.myDirName = undefined

      let actual!: Error
      try {
        storageService.getUserDirPath(user)
      } catch (err) {
        actual = err
      }

      expect(actual).toBeDefined()
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

    describe('serveAppFile', () => {
      it('アプリケーション管理者の場合 - ファイルは公開未設定', async () => {
        const uploadItem: StorageUploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])

        return request(app.getHttpServer())
          .get(`/storage/${uploadItem.path}`)
          .set({ ...APP_ADMIN_USER_HEADER })
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(uploadItem.data)
          })
      })

      it('アプリケーション管理者でない場合 - ファイルは公開未設定 - 上位ディレクトリも公開未設定', async () => {
        // ディレクトリを作成
        await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])
        // ファイルのアップロード
        const uploadItem: StorageUploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])

        return (
          request(app.getHttpServer())
            .get(`/storage/${uploadItem.path}`)
            // アプリケーション管理者以外を設定
            .set({ ...STORAGE_USER_HEADER })
            .expect(403)
        )
      })

      it('アプリケーション管理者でない場合 - ファイルは公開未設定 - 上位ディレクトリに公開設定', async () => {
        // ディレクトリを作成
        await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])
        // ファイルのアップロード
        const uploadItem: StorageUploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])
        // 上位ディレクトリに公開設定
        await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true })

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
        // ファイルのアップロード
        const uploadItem: StorageUploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])
        // ファイルに公開設定
        await storageService.setFileShareSettings(null, uploadItem.path, { isPublic: true })

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
        // ディレクトリを作成
        await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])
        // ファイルのアップロード
        const uploadItem: StorageUploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])
        // ファイルに公開設定
        await storageService.setFileShareSettings(null, uploadItem.path, { isPublic: true })
        // 上位ディレクトリに非公開設定
        await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: false })

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
        // ファイルのアップロード
        const uploadItem: StorageUploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])
        // ファイルに読み込み権限設定
        await storageService.setFileShareSettings(null, uploadItem.path, { readUIds: [STORAGE_USER_TOKEN.uid] })

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
        // ディレクトリを作成
        await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])
        // ファイルのアップロード
        const uploadItem: StorageUploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])
        // ファイルに読み込み権限設定
        await storageService.setFileShareSettings(null, uploadItem.path, { readUIds: [STORAGE_USER_TOKEN.uid] })
        // 上位ディレクトリに読み込み権限設定(ファイルの読み込み権限とは別ユーザーを指定)
        await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { readUIds: ['ichiro'] })

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
        // ディレクトリを作成
        await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])
        // ファイルのアップロード
        const uploadItem: StorageUploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])
        // 上位ディレクトリに読み込み権限設定
        await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { readUIds: [STORAGE_USER_TOKEN.uid] })

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
        // ディレクトリを作成
        await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])
        // ファイルのアップロード
        const uploadItem: StorageUploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])
        // ファイルに非公開設定
        await storageService.setFileShareSettings(null, uploadItem.path, { isPublic: false })
        // 上位ディレクトリに公開設定
        await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true })

        // ファイルの非公開設定が適用される
        return request(app.getHttpServer()).get(`/storage/${uploadItem.path}`).expect(401)
      })

      it('ログインしていない場合 - ファイルが公開されている', async () => {
        // ファイルのアップロード
        const uploadItem: StorageUploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])
        // ファイルを公開に設定
        await storageService.setFileShareSettings(null, uploadItem.path, { isPublic: true })

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
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])

        // Authorizationヘッダーを設定しない
        return request(app.getHttpServer()).get(`/storage/${uploadItem.path}`).expect(401)
      })
    })

    describe('serveUserFile', () => {
      it('自ユーザーの場合 - ファイルは公開未設定', async () => {
        const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
        // ファイルのアップロード
        const uploadItem: StorageUploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])

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
        // ファイルのアップロード
        const uploadItem: StorageUploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])

        return request(app.getHttpServer())
          .get(`/storage/${uploadItem.path}`)
          .set({ ...APP_ADMIN_USER_HEADER })
          .expect(403)
      })

      it('他ユーザーの場合 - ファイルは公開未設定 - 上位ディレクトリに公開設定', async () => {
        const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
        // ディレクトリを作成
        await storageService.createDirs(null, [`${userDirPath}/d1`])
        // ファイルのアップロード
        const uploadItem: StorageUploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])
        // 上位ディレクトリに公開設定
        await storageService.setDirShareSettings(null, `${userDirPath}/d1`, { isPublic: true })

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
        // ファイルのアップロード
        const uploadItem: StorageUploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])
        // ファイルに公開設定
        await storageService.setFileShareSettings(null, uploadItem.path, { isPublic: true })

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
        // ディレクトリを作成
        await storageService.createDirs(null, [`${userDirPath}/d1`])
        // ファイルのアップロード
        const uploadItem: StorageUploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])
        // ファイルに公開設定
        await storageService.setFileShareSettings(null, uploadItem.path, { isPublic: true })
        // 上位ディレクトリに非公開設定
        await storageService.setDirShareSettings(null, `${userDirPath}/d1`, { isPublic: false })

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
        // ファイルのアップロード
        const uploadItem: StorageUploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])
        // ファイルに読み込み権限設定
        await storageService.setFileShareSettings(null, uploadItem.path, { readUIds: [APP_ADMIN_USER.uid] })

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
        await storageService.createDirs(null, [`${userDirPath}/d1`])
        // ファイルのアップロード
        const uploadItem: StorageUploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])
        // ファイルに読み込み権限設定
        await storageService.setFileShareSettings(null, uploadItem.path, { readUIds: [APP_ADMIN_USER.uid] })
        // 上位ディレクトリに読み込み権限設定
        await storageService.setDirShareSettings(null, `${userDirPath}/d1`, { readUIds: ['ichiro'] })

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
        // ディレクトリの作成
        await storageService.createDirs(null, [`${userDirPath}/d1`])
        // ファイルのアップロード
        const uploadItem: StorageUploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])
        // 上位ディレクトリに読み込み権限設定
        await storageService.setDirShareSettings(null, `${userDirPath}/d1`, { readUIds: [APP_ADMIN_USER.uid] })

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
        // ファイルのアップロード
        const uploadItem: StorageUploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])
        // ファイルを公開に設定
        await storageService.setFileShareSettings(null, uploadItem.path, { isPublic: true })

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
        // ファイルのアップロード
        const uploadItem: StorageUploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])

        // Authorizationヘッダーを設定しない
        return request(app.getHttpServer()).get(`/storage/${uploadItem.path}`).expect(401)
      })
    })
  })
})
