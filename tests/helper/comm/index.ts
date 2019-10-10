import * as firebaseAdmin from 'firebase-admin'
import { GQLFacade } from '@/gql'
import { GQLFacadeImpl } from '@/gql/facade'
import axios from 'axios'
import gql from 'graphql-tag'

export interface CollectionData {
  collectionName: string
  collectionRecords: any[]
}

export interface AuthUser extends Partial<firebaseAdmin.auth.DecodedIdToken> {
  uid: string
}

export interface UploadFileItem {
  fileData: string | Blob | Uint8Array | ArrayBuffer | File
  filePath: string
  contentType: string
}

export class GQLTestFacade extends GQLFacadeImpl {
  private m_user?: AuthUser

  setAuthUser(user: AuthUser): void {
    this.m_user = user
  }

  clearAuthUser(): void {
    this.m_user = undefined
  }

  protected async getIdToken(): Promise<string> {
    if (this.m_user) {
      return JSON.stringify(this.m_user)
    }
    return ''
  }

  async putTestData(inputs: CollectionData[]): Promise<void> {
    await this.mutate<{ data: boolean }>({
      mutation: gql`
        mutation PutTestData($inputs: [PutTestDataInput!]!) {
          putTestData(inputs: $inputs)
        }
      `,
      variables: { inputs },
    })
  }

  async uploadTestFiles(uploadList: UploadFileItem[]) {
    const readAsArrayBuffer = (fileData: string | Blob | Uint8Array | ArrayBuffer | File) => {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        if (typeof fileData === 'string') {
          const enc = new TextEncoder()
          resolve(enc.encode(fileData))
        } else if (fileData instanceof Blob) {
          const reader = new FileReader()
          reader.onload = () => {
            resolve(reader.result as ArrayBuffer)
          }
          reader.onerror = err => {
            reject(err)
          }
          reader.readAsArrayBuffer(fileData)
        } else {
          resolve(fileData)
        }
      })
    }

    const _uploadList = uploadList as (UploadFileItem & { signedUploadUrl: string })[]

    const inputs = _uploadList.map(item => {
      return { filePath: item.filePath, contentType: item.contentType }
    })
    const signedUploadUrls = await (async () => {
      const response = await this.query<{ testSignedUploadUrls: string[] }>({
        query: gql`
          query GetTestSignedUploadUrls($inputs: [TestSignedUploadUrlInput!]!) {
            testSignedUploadUrls(inputs: $inputs)
          }
        `,
        variables: { inputs },
      })
      return response.data.testSignedUploadUrls
    })()

    signedUploadUrls.forEach((url, index) => {
      _uploadList[index].signedUploadUrl = url
    })

    const promises: Promise<void>[] = []
    for (const uploadItem of _uploadList) {
      promises.push(
        (async () => {
          const data = await readAsArrayBuffer(uploadItem.fileData)
          await axios.request({
            url: uploadItem.signedUploadUrl,
            method: 'put',
            data,
            headers: {
              'content-type': 'application/octet-stream',
            },
          })
        })()
      )
    }
    await Promise.all(promises)
  }

  async removeTestStorageFiles(filePaths: string[]): Promise<boolean> {
    const response = await this.mutate<{ removeTestStorageFiles: boolean }>({
      mutation: gql`
        mutation RemoveTestStorageFiles($filePaths: [String!]!) {
          removeTestStorageFiles(filePaths: $filePaths)
        }
      `,
      variables: { filePaths },
    })
    return response.data.removeTestStorageFiles
  }

  async removeTestStorageDir(dirPath: string): Promise<boolean> {
    const response = await this.mutate<{ removeTestStorageDir: boolean }>({
      mutation: gql`
        mutation RemoveTestStorageDir($dirPath: String!) {
          removeTestStorageDir(dirPath: $dirPath)
        }
      `,
      variables: { dirPath },
    })
    return response.data.removeTestStorageDir
  }
}
export const testGQL: GQLFacade = new GQLTestFacade()

export async function putTestData(inputs: CollectionData[]): Promise<void> {
  await (testGQL as GQLTestFacade).putTestData(inputs)
}

export async function uploadTestFiles(uploadList: UploadFileItem[]): Promise<void> {
  await (testGQL as GQLTestFacade).uploadTestFiles(uploadList)
}

export async function removeTestStorageFiles(filePaths: string[]): Promise<void> {
  await (testGQL as GQLTestFacade).removeTestStorageFiles(filePaths)
}

export async function removeTestStorageDir(dirPath: string): Promise<void> {
  await (testGQL as GQLTestFacade).removeTestStorageDir(dirPath)
}

export function setAuthUser(user: AuthUser): void {
  ;(testGQL as GQLTestFacade).setAuthUser(user)
}

export function clearAuthUser(): void {
  ;(testGQL as GQLTestFacade).clearAuthUser()
}

export function removeGQLMetadata<T>(data: T): T {
  function _isObject(value: any): boolean {
    return value instanceof Object && !(value instanceof Array)
  }

  function _remove(obj: Object) {
    delete obj['__typename']
  }

  if (Array.isArray(data)) {
    for (const obj of data) {
      removeGQLMetadata(obj)
    }
  } else if (_isObject(data)) {
    _remove(data)
    for (const key of Object.keys(data)) {
      removeGQLMetadata(data[key])
    }
  }
  return data
}
