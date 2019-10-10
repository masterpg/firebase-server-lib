import 'unfetch/polyfill'
import { ApolloClient, ApolloQueryResult, MutationOptions, OperationVariables, QueryOptions } from 'apollo-client'
import { ApolloLink, FetchResult } from 'apollo-link'
import { InMemoryCache, NormalizedCacheObject } from 'apollo-cache-inmemory'
import { config } from '@/base/config'
import { createHttpLink } from 'apollo-link-http'
import { setContext } from 'apollo-link-context'

export abstract class BaseGQLClient {
  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  async query<T = any, TVariables = OperationVariables>(options: QueryOptions<TVariables> & { isAuth?: boolean }): Promise<ApolloQueryResult<T>> {
    const client = await this.m_getClient(options.isAuth)
    return client.query(options)
  }

  async mutate<T = any, TVariables = OperationVariables>(options: MutationOptions<T, TVariables> & { isAuth?: boolean }): Promise<FetchResult<T>> {
    const client = await this.m_getClient(options.isAuth)
    return client.mutate(options)
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  private async m_getClient(isAuth: boolean = false): Promise<ApolloClient<NormalizedCacheObject>> {
    let link: ApolloLink = createHttpLink({
      uri: this.getRequestURL,
    })

    if (isAuth) {
      const idToken = await this.getIdToken()
      const authLink = setContext((_, { headers }) => {
        return {
          headers: {
            ...headers,
            authorization: `Bearer ${idToken}`,
          },
        }
      })

      link = authLink.concat(link)
    }

    return new ApolloClient({
      link,
      cache: new InMemoryCache(),
    })
  }

  protected getRequestURL(): string {
    return `${config.api.baseURL}/gql`
  }

  protected async getIdToken(): Promise<string> {
    const currentUser = firebase.auth().currentUser
    if (!currentUser) throw new Error('Not signed in.')
    return await currentUser.getIdToken()
  }
}
