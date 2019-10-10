import { RESTFacade } from '@/rest/types'
import { RESTFacadeImpl } from '@/rest/facade'

export let rest: RESTFacade

export function initREST(restFacade?: RESTFacade): void {
  if (restFacade) {
    rest = restFacade
  } else {
    rest = new RESTFacadeImpl()
  }
}

export * from '@/rest/types'
