import * as td from 'testdouble'
import { AuthDataResult, AuthStatus, PublicProfile, User, UserInfoInput, UserServiceDI } from '../../../../../src/lib/services'
import { getGQLErrorStatus, requestGQL } from '../../../../helpers/common/gql'
import GQLContainerModule from '../../../../../src/example/gql/gql.module'
import { OmitEntityTimestamp } from '../../../../../src/firestore-ex'
import { Test } from '@nestjs/testing'
import { UserIdClaims } from '../../../../../src/lib/nest'
import { initApp } from '../../../../../src/example/base'
import { merge } from 'lodash'
import dayjs = require('dayjs')

jest.setTimeout(25000)
initApp()

//========================================================================
//
//  Test data
//
//========================================================================

const now = dayjs()

const ICHIRO: User = {
  id: 'ichiro',
  fullName: '鈴木 一郎',
  email: 'ichiro@example.com',
  emailVerified: true,
  isAppAdmin: false,
  myDirName: 'abcdefg',
  createdAt: now,
  updatedAt: now,
  publicProfile: {
    id: 'ichiro',
    displayName: 'イチロー',
    photoURL: 'https://example.com/ichiro/user.png',
    createdAt: now,
    updatedAt: now,
  },
}

const ICHIRO_TOKEN: UserIdClaims = {
  uid: ICHIRO.id,
  myDirName: ICHIRO.myDirName,
  isAppAdmin: ICHIRO.isAppAdmin,
}

const ICHIRO_HEADER = { Authorization: `Bearer ${JSON.stringify(ICHIRO_TOKEN)}` }

//========================================================================
//
//  Test Helpers
//
//========================================================================

interface ResponsePublicProfile extends OmitEntityTimestamp<PublicProfile> {
  createdAt: string
  updatedAt: string
}

interface ResponseUser extends Omit<OmitEntityTimestamp<User>, 'publicProfile'> {
  createdAt: string
  updatedAt: string
  publicProfile: ResponsePublicProfile
}

function toResponseUser(user: User): ResponseUser {
  return merge({}, user, {
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    publicProfile: {
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    },
  })
}

//========================================================================
//
//  Tests
//
//========================================================================

describe('UserResolver', () => {
  let app: any
  let userService: UserServiceDI.type

  beforeEach(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [GQLContainerModule],
    }).compile()

    app = testingModule.createNestApplication()
    await app.init()
    userService = testingModule.get<UserServiceDI.type>(UserServiceDI.symbol)
  })

  describe('authData', () => {
    const gql = {
      query: `
        query GetAuthData {
          authData {
            status
            token
            user { 
              id fullName email emailVerified isAppAdmin myDirName createdAt updatedAt
              publicProfile { id displayName photoURL createdAt updatedAt }
            }
          }
        }
      `,
    }

    it('疎通確認', async () => {
      const getAuthData = td.replace(userService, 'getAuthData')
      const authDataResult: AuthDataResult = {
        status: AuthStatus.WaitForEntry,
        token: 'abcdefghijklmnopqrstuvwxyz',
        user: ICHIRO,
      }
      td.when(getAuthData(ICHIRO_TOKEN.uid)).thenResolve(authDataResult)

      const response = await requestGQL(app, gql, {
        headers: { ...ICHIRO_HEADER },
      })

      expect(response.body.data.authData).toEqual({
        status: authDataResult.status,
        token: authDataResult.token,
        user: toResponseUser(authDataResult.user!),
      })
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('setOwnUserInfo', () => {
    const ICHIRO_INPUT: UserInfoInput = {
      fullName: '鈴木 一郎',
      displayName: 'イチロー',
    }

    const gql = {
      query: `
        mutation SetOwnUserInfo($input: UserInfoInput!) {
          setOwnUserInfo(input: $input) {
            id fullName email emailVerified isAppAdmin myDirName createdAt updatedAt
            publicProfile { id displayName photoURL createdAt updatedAt }
          }
        }
      `,
      variables: {
        input: ICHIRO_INPUT,
      },
    }

    it('疎通確認', async () => {
      const setUserInfo = td.replace(userService, 'setUserInfo')
      td.when(setUserInfo(ICHIRO_TOKEN.uid, td.matchers.contains(ICHIRO_INPUT))).thenResolve(ICHIRO)

      const response = await requestGQL(app, gql, {
        headers: { ...ICHIRO_HEADER },
      })

      expect(response.body.data.setOwnUserInfo).toEqual(toResponseUser(ICHIRO))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('deleteOwnUser', () => {
    const gql = {
      query: `
        mutation DeleteOwnUser {
          deleteOwnUser
        }
      `,
    }

    it('疎通確認', async () => {
      const deleteUser = td.replace(userService, 'deleteUser')
      td.when(deleteUser(ICHIRO_TOKEN.uid)).thenResolve(true)

      const response = await requestGQL(app, gql, {
        headers: { ...ICHIRO_HEADER },
      })

      expect(response.body.data.deleteOwnUser).toBeTruthy()
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })
})
