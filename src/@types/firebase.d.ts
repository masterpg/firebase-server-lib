/**
 * https://github.com/microsoft/TypeScript/issues/10178#issuecomment-457021958
 */

import _firebase from 'firebase'

declare global {
  const firebase: typeof _firebase
}
