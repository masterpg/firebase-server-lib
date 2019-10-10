import { GQLFacade } from '@/gql/types'
import { GQLFacadeImpl } from '@/gql/facade'

export let gql: GQLFacade

export function initGQL(gqlFacade?: GQLFacade): void {
  if (gqlFacade) {
    gql = gqlFacade
  } else {
    gql = new GQLFacadeImpl()
  }
}

export * from '@/gql/types'
