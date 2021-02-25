import * as td from 'testdouble'
import { AuthDataResult, IdToken, SetUserInfoResultStatus, User, UserInput, UserServiceDI } from '../../../../../../../src/app/services'
import { GeneralUserHeader, GeneralUserToken, getGQLErrorStatus, requestGQL } from '../../../../../../helpers/app'
import { cloneDeep, merge } from 'lodash'
import Lv1GQLContainerModule from '../../../../../../../src/app/gql/main/lv1'
import { OmitEntityTimestamp } from '../../../../../../../src/firestore-ex'
import { Test } from '@nestjs/testing'
import { UnauthorizedException } from '@nestjs/common'
import { initApp } from '../../../../../../../src/app/base'
import dayjs = require('dayjs')

jest.setTimeout(5000)
initApp()

//========================================================================
//
//  Test data
//
//========================================================================

function VerifiedUser(): User {
  const now = dayjs()
  return cloneDeep(
    ((VerifiedUser as any).instance = (VerifiedUser as any).instance || {
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
    })
  )
}

function VerifiedUserToken(): IdToken {
  const now = dayjs()
  return cloneDeep(
    ((VerifiedUserToken as any).instance = (VerifiedUserToken as any).instance || {
      aud: 'my-app-1234',
      auth_time: now.unix(),
      email: VerifiedUser().email,
      email_verified: VerifiedUser().emailVerified,
      exp: now.add(1, 'hour').unix(),
      firebase: {
        identities: {
          email: [VerifiedUser().email],
        },
        sign_in_provider: 'custom',
      },
      iat: now.unix(),
      iss: 'https://securetoken.google.com/my-app-1234',
      sub: VerifiedUser().id,
      uid: VerifiedUser().id,
      authStatus: 'WaitForEmailVerified',
      isAppAdmin: VerifiedUser().isAppAdmin,
    })
  )
}

function VerifiedUserHeader() {
  return { Authorization: `Bearer ${JSON.stringify(VerifiedUserToken())}` }
}

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
        user: VerifiedUser(),
      }
      td.when(getAuthData(VerifiedUserToken().uid)).thenResolve(authDataResult)

      const response = await requestGQL(app, gql, {
        headers: VerifiedUserHeader(),
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

  describe('setUserInfo', () => {
    const VerifiedUserInput: UserInput = {
      userName: 'ichiro',
      fullName: '鈴木 一郎',
      photoURL: 'https://example.com/ichiro/user.png',
    }

    const gql = {
      query: `
        mutation SetUserInfo($uid: String!, $input: UserInput!) {
          setUserInfo(uid: $uid, input: $input) {
            status
            user {
              id email emailVerified userName fullName isAppAdmin photoURL version createdAt updatedAt
            }
          }
        }
      `,
      variables: {
        uid: VerifiedUserToken().uid,
        input: VerifiedUserInput,
      },
    }

    it('疎通確認', async () => {
      const setUserInfo = td.replace(userService, 'setUserInfo')
      td.when(setUserInfo(VerifiedUserToken(), VerifiedUserToken().uid, VerifiedUserInput)).thenResolve({
        status: 'Success',
        user: VerifiedUser(),
      })

      const response = await requestGQL(app, gql, {
        headers: VerifiedUserHeader(),
      })

      expect(response.body.data.setUserInfo).toEqual({
        status: 'Success' as SetUserInfoResultStatus,
        user: toResponseUser(VerifiedUser()),
      })
    })

    it('サインインしていない場合', async () => {
      const setUserInfo = td.replace(userService, 'setUserInfo')
      td.when(setUserInfo(undefined as any, VerifiedUserToken().uid, VerifiedUserInput)).thenReject(new UnauthorizedException())

      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('deleteUser', () => {
    const gql = {
      query: `
        mutation DeleteUser($uid: String!) {
          deleteUser(uid: $uid)
        }
      `,
      variables: { uid: GeneralUserToken().uid },
    }

    it('疎通確認', async () => {
      const deleteUser = td.replace(userService, 'deleteUser')

      const response = await requestGQL(app, gql, { headers: GeneralUserHeader() })

      expect(response.body.data.deleteUser).toBeTruthy()

      const exp = td.explain(deleteUser)
      expect(exp.calls.length).toBe(1)
      expect(exp.calls[0].args).toEqual([GeneralUserToken(), GeneralUserToken().uid])
    })

    it('サインインしていない場合', async () => {
      const deleteUser = td.replace(userService, 'deleteUser')
      td.when(deleteUser(undefined as any, GeneralUserToken().uid)).thenReject(new UnauthorizedException())

      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })
})
