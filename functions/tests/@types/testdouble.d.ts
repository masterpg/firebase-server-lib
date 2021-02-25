import 'testdouble'
import { DeepPartial } from 'web-base-lib'
import { TextEncoder as _TextEncoder } from 'util'
import _td from 'testdouble'

declare global {
  const td: typeof _td

  interface Window {
    td: typeof _td
    TextEncoder: typeof _TextEncoder
  }
}

declare module 'testdouble' {
  export function replace<T = any, K extends keyof T = keyof T, F = DeepPartial<T[K]>>(path: T, property: K, f?: F): T[K]
}
