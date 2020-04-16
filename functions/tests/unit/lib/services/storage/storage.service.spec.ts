import * as admin from 'firebase-admin'
import { LibStorageService, LibStorageServiceDI, StorageNodeShareSettings, StorageUser, UploadDataItem } from '../../../../../src/lib'
import { Test, TestingModule } from '@nestjs/testing'
import { AppBaseModule } from '../../../../../src/example/app.module'
import { Response } from 'supertest'
import { initApp } from '../../../../../src/example/initializer'
const request = require('supertest')
const cloneDeep = require('lodash/cloneDeep')

jest.setTimeout(25000)
initApp()

//========================================================================
//
//  Test data
//
//========================================================================

const STORAGE_TEST_USER: StorageUser = { uid: 'storage.test.user', myDirName: 'storage.test.user' }

const APP_ADMIN_USER = { uid: 'app.admin.user', myDirName: 'app.admin.user', isAppAdmin: true }

const TEST_FILES_DIR = 'test-files'

//========================================================================
//
//  Test helpers
//
//========================================================================

let testingModule: TestingModule

let storageService!: LibStorageService

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
    testingModule = await Test.createTestingModule({
      imports: [AppBaseModule],
    }).compile()

    storageService = testingModule.get<LibStorageService>(LibStorageServiceDI.symbol)

    await storageService.removeDir(null, `${TEST_FILES_DIR}`)
    await storageService.removeDir(null, `${storageService.getUserDirPath(STORAGE_TEST_USER)}`)

    // Cloud Storageで短い間隔のノード追加・削除を行うとエラーが発生するので間隔調整している
    await sleep(2000)
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
        await storageService.removeDir(null, userDirPath)
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
      const userDirNode = await storageService.getRealDirNode(null, userDirPath)
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
      const userDirNode = await storageService.getRealDirNode(null, userDirPath)
      expect(userDirNode.exists).toBeTruthy()
    })

    it('カスタムクレイムにユーザーディレクトリ名が割り当てられていて、かつユーザーディレクトリも存在する場合', async () => {
      // カスタムクレイムのユーザーディレクトリ名を設定
      await admin.auth().setCustomUserClaims(STORAGE_TEST_USER.uid, { myDirName: STORAGE_TEST_USER.myDirName })
      // ユーザーディレクトリを作成
      const beforeUserDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)
      const beforeUserDirNode = (await storageService.createDirs(null, [beforeUserDirPath]))[0]

      await storageService.assignUserDir(STORAGE_TEST_USER)

      const afterUser = await admin.auth().getUser(STORAGE_TEST_USER.uid)
      // カスタムクレイムのユーザーディレクトリ名に変化がないことを検証
      expect((afterUser.customClaims as any).myDirName).toBe(STORAGE_TEST_USER.myDirName)
      // ユーザーディレクトリに変化がないことを検証
      const afterUserDirPath = storageService.getUserDirPath(afterUser)
      expect(afterUserDirPath).toBe(beforeUserDirPath)
      const afterUserDirNode = await storageService.getRealDirNode(null, afterUserDirPath)
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

  describe('Serve files', () => {
    //--------------------------------------------------
    //  Test helpers
    //--------------------------------------------------

    const STORAGE_TEST_USER_HEADER = { Authorization: `Bearer ${JSON.stringify(STORAGE_TEST_USER)}` }

    const APP_ADMIN_USER_HEADER = { Authorization: `Bearer ${JSON.stringify(APP_ADMIN_USER)}` }

    let app: any

    beforeEach(async () => {
      app = testingModule.createNestApplication()
      await app.init()
    })

    //--------------------------------------------------
    //  Tests
    //--------------------------------------------------

    describe('serveAppFile', () => {
      it('アプリケーション管理者の場合 - ファイルが公開されていない場合', async () => {
        const uploadItem: UploadDataItem = {
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

      it('アプリケーション管理者以外の場合 - ファイルが公開されていない場合', async () => {
        const uploadItem: UploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])

        return (
          request(app.getHttpServer())
            .get(`/storage/${uploadItem.path}`)
            // アプリケーション管理者以外を設定
            .set({ ...STORAGE_TEST_USER_HEADER })
            .expect(403)
        )
      })

      it('アプリケーション管理者以外の場合 - ファイル自体に公開設定されている場合', async () => {
        const uploadItem: UploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])
        // ファイルの公開フラグをオンに設定
        await storageService.setFileShareSettings(null, uploadItem.path, { isPublic: true })

        return (
          request(app.getHttpServer())
            .get(`/storage/${uploadItem.path}`)
            // アプリケーション管理者以外を設定
            .set({ ...STORAGE_TEST_USER_HEADER })
            .expect(200)
            .then((res: Response) => {
              expect(res.text).toEqual(uploadItem.data)
            })
        )
      })

      it('アプリケーション管理者以外の場合 - 上位ディレクトリに公開設定されている場合', async () => {
        // ディレクトリを作成
        await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`])
        // ファイルのアップロード
        const uploadItem: UploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])
        // ディレクトリの公開フラグをオンに設定
        await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true })

        return (
          request(app.getHttpServer())
            .get(`/storage/${uploadItem.path}`)
            // アプリケーション管理者以外を設定
            .set({ ...STORAGE_TEST_USER_HEADER })
            .expect(200)
            .then((res: Response) => {
              expect(res.text).toEqual(uploadItem.data)
            })
        )
      })

      it('アプリケーション管理者以外の場合 - ファイル自体に共有ユーザーIDが設定されている場合', async () => {
        const uploadItem: UploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])
        // ファイルの共有ユーザーIDを設定
        await storageService.setFileShareSettings(null, uploadItem.path, { uids: [STORAGE_TEST_USER.uid] })

        return (
          request(app.getHttpServer())
            .get(`/storage/${uploadItem.path}`)
            // 共有ユーザーIDにマッチするユーザーを設定
            .set({ ...STORAGE_TEST_USER_HEADER })
            .expect(200)
            .then((res: Response) => {
              expect(res.text).toEqual(uploadItem.data)
            })
        )
      })

      it('アプリケーション管理者以外の場合 - 上位ディレクトリに共有ユーザーIDが設定されている場合', async () => {
        // ディレクトリを作成
        await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`])
        // ファイルのアップロード
        const uploadItem: UploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])
        // ディレクトリの共有ユーザーIDを設定
        await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { uids: [STORAGE_TEST_USER.uid] })

        return (
          request(app.getHttpServer())
            .get(`/storage/${uploadItem.path}`)
            // 共有ユーザーIDにマッチするユーザーを設定
            .set({ ...STORAGE_TEST_USER_HEADER })
            .expect(200)
            .then((res: Response) => {
              expect(res.text).toEqual(uploadItem.data)
            })
        )
      })

      it('ログインしていない場合 - ファイルが公開されている場合', async () => {
        const uploadItem: UploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])
        // ファイルの公開フラグをオンに設定
        await storageService.setFileShareSettings(null, uploadItem.path, { isPublic: true })

        // Authorizationヘッダーを設定しない
        return request(app.getHttpServer())
          .get(`/storage/${uploadItem.path}`)
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(uploadItem.data)
          })
      })

      it('ログインしていない場合 - ファイルが公開されていない場合', async () => {
        const uploadItem: UploadDataItem = {
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
      it('自ユーザーの場合 - ファイルが公開されていない場合', async () => {
        const userDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)
        const uploadItem: UploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])

        return request(app.getHttpServer())
          .get(`/storage/${uploadItem.path}`)
          .set({ ...STORAGE_TEST_USER_HEADER })
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
        await storageService.uploadAsFiles(null, [uploadItem])

        return request(app.getHttpServer())
          .get(`/storage/${uploadItem.path}`)
          .set({ ...APP_ADMIN_USER_HEADER })
          .expect(403)
      })

      it('他ユーザーの場合 - ファイル自体に公開設定されている場合', async () => {
        const userDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)
        const uploadItem: UploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])
        // ファイルの公開フラグをオンに設定
        await storageService.setFileShareSettings(null, uploadItem.path, { isPublic: true })

        return request(app.getHttpServer())
          .get(`/storage/${uploadItem.path}`)
          .set({ ...APP_ADMIN_USER_HEADER })
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(uploadItem.data)
          })
      })

      it('他ユーザーの場合 - 上位ディレクトリに公開設定されている場合', async () => {
        const userDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)
        // ディレクトリを作成
        await storageService.createDirs(null, [`${userDirPath}/d1/d11`])
        // ファイルのアップロード
        const uploadItem: UploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/d11/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])
        // ディレクトリの公開フラグをオンに設定
        await storageService.setDirShareSettings(null, `${userDirPath}/d1`, { isPublic: true })

        return request(app.getHttpServer())
          .get(`/storage/${uploadItem.path}`)
          .set({ ...APP_ADMIN_USER_HEADER })
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(uploadItem.data)
          })
      })

      it('他ユーザーの場合 - ファイル自体に共有ユーザーIDが設定されている場合', async () => {
        const userDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)
        const uploadItem: UploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])
        // ファイルの共有ユーザーIDを設定
        await storageService.setFileShareSettings(null, uploadItem.path, { uids: [APP_ADMIN_USER.uid] })

        return (
          request(app.getHttpServer())
            .get(`/storage/${uploadItem.path}`)
            // 共有ユーザーIDにマッチするユーザーを設定
            .set({ ...APP_ADMIN_USER_HEADER })
            .expect(200)
            .then((res: Response) => {
              expect(res.text).toEqual(uploadItem.data)
            })
        )
      })

      it('他ユーザーの場合 - 上位ディレクトリに共有ユーザーIDが設定されている場合', async () => {
        const userDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)
        // ディレクトリを作成
        await storageService.createDirs(null, [`${userDirPath}/d1/d11`])
        // ファイルのアップロード
        const uploadItem: UploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])
        // ディレクトリの共有ユーザーIDを設定
        await storageService.setDirShareSettings(null, `${userDirPath}/d1`, { uids: [APP_ADMIN_USER.uid] })

        return (
          request(app.getHttpServer())
            .get(`/storage/${uploadItem.path}`)
            // 共有ユーザーIDにマッチするユーザーを設定
            .set({ ...APP_ADMIN_USER_HEADER })
            .expect(200)
            .then((res: Response) => {
              expect(res.text).toEqual(uploadItem.data)
            })
        )
      })

      it('ログインしていない場合 - ファイルが公開されている場合', async () => {
        const userDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)
        const uploadItem: UploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${userDirPath}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])
        // ファイルの公開フラグをオンに設定
        await storageService.setFileShareSettings(null, uploadItem.path, { isPublic: true })

        // Authorizationヘッダーを設定しない
        return request(app.getHttpServer())
          .get(`/storage/${uploadItem.path}`)
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(uploadItem.data)
          })
      })

      it('ログインしていない場合 - ファイルが公開されていない場合', async () => {
        const userDirPath = storageService.getUserDirPath(STORAGE_TEST_USER)
        const uploadItem: UploadDataItem = {
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
