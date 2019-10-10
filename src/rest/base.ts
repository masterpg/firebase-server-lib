import axios, { Method, ResponseType } from 'axios'
import Vue from 'vue'
import { config } from '@/base/config'

export interface APIRequestConfig {
  headers?: any
  params?: any
  paramsSerializer?: (params: any) => string
  responseType?: ResponseType
  isAuth?: boolean
}

export interface APIResponse<T = any> {
  data: T
  status: number
  statusText: string
  headers: any
  config: APIRequestConfig
  request?: any
}

export interface APIError extends Error {
  config: APIRequestConfig
  code?: string
  request?: any
  response?: APIResponse
}

export type APIPromise<T = any> = Promise<APIResponse<T>>

interface APIRequestInternalConfig extends APIRequestConfig {
  url: string
  method: Method
  data?: any
}

export abstract class BaseAPI extends Vue {
  get<T = any>(path: string, config?: APIRequestConfig): APIPromise<T> {
    return this.request({
      ...(config || {}),
      url: path,
      method: 'get',
    })
  }

  delete(path: string, config?: APIRequestConfig): APIPromise {
    return this.request({
      ...(config || {}),
      url: path,
      method: 'delete',
    })
  }

  post<T = any>(path: string, data?: any, config?: APIRequestConfig): APIPromise<T> {
    return this.request({
      ...(config || {}),
      url: path,
      method: 'post',
      data,
    })
  }

  put<T = any>(path: string, data?: any, config?: APIRequestConfig): APIPromise<T> {
    return this.request({
      ...(config || {}),
      url: path,
      method: 'put',
      data,
    })
  }

  async request<T = any>(config: APIRequestInternalConfig): APIPromise<T> {
    const axiosConfig = {
      ...config,
      baseURL: this.getRequestURL(),
    }
    delete axiosConfig.isAuth

    if (config.isAuth) {
      const idToken = await this.getIdToken()
      axiosConfig.headers = {
        ...(axiosConfig.headers || {}),
        Authorization: `Bearer ${idToken}`,
      }
    }

    return axios.request(axiosConfig)
  }

  protected getRequestURL(): string {
    return `${config.api.baseURL}`
  }

  protected async getIdToken(): Promise<string> {
    const currentUser = firebase.auth().currentUser
    if (!currentUser) throw new Error('Not signed in.')
    return await currentUser.getIdToken()
  }
}
