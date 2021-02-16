import * as td from 'testdouble'
import {
  AuthDataResult,
  AuthStatus,
  SetUserInfoResultStatus,
  User,
  UserIdClaims,
  UserInput,
  UserServiceDI,
} from '../../../../../../../src/app/services'
import { getGQLErrorStatus, requestGQL } from '../../../../../../helpers/app'
import Lv1GQLContainerModule from '../../../../../../../src/app/gql/main/lv1'
import { OmitEntityTimestamp } from '../../../../../../../src/firestore-ex'
import { Test } from '@nestjs/testing'
import { initApp } from '../../../../../../../src/app/base'
import { merge } from 'lodash'
import dayjs = require('dayjs')

jest.setTimeout(5000)
initApp()

//========================================================================
//
//  Test data
//
//========================================================================

const now = dayjs()

const Ichiro: User = {
  id: 'ichiro',
  email: 'ichiro@example.com',
  emailVerified: true,
  userName: 'ichiro',
  fullName: '鈴木 一郎',
  isAppAdmin: false,
  photoURL: 'https://example.com/ichiro/user.png',
  version: 1,
  createdAt: now,
  updatedAt: now,
}

const IchiroToken: UserIdClaims = {
  uid: Ichiro.id,
  authStatus: 'WaitForEmailVerified',
  isAppAdmin: Ichiro.isAppAdmin,
}

const IchiroHeader = { Authorization: `Bearer ${JSON.stringify(IchiroToken)}` }

//========================================================================
//
//  Test Helpers
//
//========================================================================

interface ResponseUser extends OmitEntityTimestamp<User> {
  createdAt: string
  updatedAt: string
}

function toResponseUser(user: User): ResponseUser {
  return merge({}, user, {
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  })
}

//========================================================================
//
//  Tests
//
//========================================================================

describe('Lv1 User Resolver', () => {
  let app: any
  let userService: UserServiceDI.type

  beforeEach(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [Lv1GQLContainerModule],
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
              id email emailVerified userName fullName isAppAdmin photoURL version createdAt updatedAt
            }
          }
        }
      `,
    }

    it('疎通確認', async () => {
      const getAuthData = td.replace(userService, 'getAuthData')
      const authDataResult: AuthDataResult = {
        status: 'WaitForEntry',
        token: 'abcdefghijklmnopqrstuvwxyz',
        user: Ichiro,
      }
      td.when(getAuthData(IchiroToken.uid)).thenResolve(authDataResult)

      const response = await requestGQL(app, gql, {
        headers: { ...IchiroHeader },
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
    const IchiroInput: UserInput = {
      userName: 'ichiro',
      fullName: '鈴木 一郎',
      photoURL: 'https://example.com/ichiro/user.png',
    }

    const gql = {
      query: `
        mutation SetOwnUser($input: UserInput!) {
          setOwnUserInfo(input: $input) {
            status
            user {
              id email emailVerified userName fullName isAppAdmin photoURL version createdAt updatedAt
            }
          }
        }
      `,
      variables: {
        input: IchiroInput,
      },
    }

    it('疎通確認', async () => {
      const setUserInfo = td.replace(userService, 'setUserInfo')
      td.when(setUserInfo(Ichiro.id, td.matchers.contains(IchiroInput))).thenResolve({ status: 'Success', user: Ichiro })

      const response = await requestGQL(app, gql, {
        headers: { ...IchiroHeader },
      })

      expect(response.body.data.setOwnUserInfo).toEqual({
        status: 'Success' as SetUserInfoResultStatus,
        user: toResponseUser(Ichiro),
      })
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
      td.when(deleteUser(IchiroToken.uid)).thenResolve(true)

      const response = await requestGQL(app, gql, {
        headers: { ...IchiroHeader },
      })

      expect(response.body.data.deleteOwnUser).toBeTruthy()
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })
})
