import * as firebase from 'firebase/app'
import { Constructor } from '@/base/types'

export type TestStoreModule<S, M> = { [P in keyof M]: M[P] } & {
  state: S
  initState(state: S): void
}

export type TestLogic<L> = { [P in keyof L]: L[P] } & {
  db: firebase.firestore.Firestore
}

export function newTestStoreModule<S, M>(storeModuleClass: Constructor<M>): TestStoreModule<S, M> {
  return new storeModuleClass() as TestStoreModule<S, M>
}
