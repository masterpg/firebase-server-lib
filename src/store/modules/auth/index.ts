import { User, UserModule, UserState } from '@/store/types'
import { BaseModule } from '@/store/base'
import { Component } from 'vue-property-decorator'
const assign = require('lodash/assign')

@Component
export class UserModuleImpl extends BaseModule<UserState> implements UserModule {
  //----------------------------------------------------------------------
  //
  //  Constructors
  //
  //----------------------------------------------------------------------

  constructor() {
    super()
    this.initState(this.m_createEmptyState())
  }

  //----------------------------------------------------------------------
  //
  //  Properties
  //
  //----------------------------------------------------------------------

  get value(): User {
    return this.state
  }

  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  clone(value: User): User {
    return {
      id: value.id,
      isSignedIn: value.isSignedIn,
      displayName: value.displayName,
      photoURL: value.photoURL,
      email: value.email,
      emailVerified: value.emailVerified,
    }
  }

  set(user: Partial<User>): User {
    const tmp = this.clone(this.state)
    assign(tmp, user)
    assign(this.state, tmp)
    return this.clone(this.state)
  }

  clear(): void {
    this.set(this.m_createEmptyState())
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  private m_createEmptyState(): User {
    return {
      id: '',
      isSignedIn: false,
      displayName: '',
      photoURL: '',
      email: '',
      emailVerified: false,
    }
  }
}
