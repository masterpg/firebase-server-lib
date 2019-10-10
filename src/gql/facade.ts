import { GQLAddCartItemInput, GQLCartItem, GQLEditCartItemResponse, GQLFacade, GQLProduct, GQLStorageNode, GQLUpdateCartItemInput } from '@/gql/types'
import { BaseGQLClient } from '@/gql/base'
import gql from 'graphql-tag'

export class GQLFacadeImpl extends BaseGQLClient implements GQLFacade {
  async customToken(): Promise<string> {
    const response = await this.query<{ customToken: string }>({
      query: gql`
        query GetCustomToken {
          customToken
        }
      `,
      isAuth: true,
    })
    return response.data.customToken
  }

  async userStorageBasePath(): Promise<string> {
    const response = await this.query<{ userStorageBasePath: string }>({
      query: gql`
        query GetUserStorageBasePath {
          userStorageBasePath
        }
      `,
      isAuth: true,
    })
    return response.data.userStorageBasePath
  }

  async userStorageDirNodes(dirPath?: string): Promise<GQLStorageNode[]> {
    const response = await this.query<{ userStorageDirNodes: GQLStorageNode[] }>({
      query: gql`
        query GetUserStorageNodes($dirPath: String) {
          userStorageDirNodes(dirPath: $dirPath) {
            nodeType
            name
            dir
            path
          }
        }
      `,
      variables: { dirPath },
      isAuth: true,
    })
    return response.data.userStorageDirNodes
  }

  async createUserStorageDirs(dirPaths: string[]): Promise<GQLStorageNode[]> {
    const response = await this.mutate<{ createUserStorageDirs: GQLStorageNode[] }>({
      mutation: gql`
        mutation CreateUserStorageDirs($dirPaths: [String!]!) {
          createUserStorageDirs(dirPaths: $dirPaths) {
            nodeType
            name
            dir
            path
          }
        }
      `,
      variables: { dirPaths },
      isAuth: true,
    })
    return response.data.createUserStorageDirs
  }

  async removeUserStorageFiles(filePaths: string[]): Promise<GQLStorageNode[]> {
    const response = await this.mutate<{ removeUserStorageFiles: GQLStorageNode[] }>({
      mutation: gql`
        mutation RemoveUserStorageFileNodes($filePaths: [String!]!) {
          removeUserStorageFiles(filePaths: $filePaths) {
            nodeType
            name
            dir
            path
          }
        }
      `,
      variables: { filePaths },
      isAuth: true,
    })
    return response.data.removeUserStorageFiles
  }

  async removeUserStorageDir(dirPath: string): Promise<GQLStorageNode[]> {
    const response = await this.mutate<{ removeUserStorageDir: GQLStorageNode[] }>({
      mutation: gql`
        mutation RemoveUserStorageDirNodes($dirPath: String!) {
          removeUserStorageDir(dirPath: $dirPath) {
            nodeType
            name
            dir
            path
          }
        }
      `,
      variables: { dirPath },
      isAuth: true,
    })
    return response.data.removeUserStorageDir
  }

  async getSignedUploadUrls(inputs: { filePath: string; contentType?: string }[]): Promise<string[]> {
    const response = await this.query<{ signedUploadUrls: string[] }>({
      query: gql`
        query GetSignedUploadUrls($inputs: [SignedUploadUrlInput!]!) {
          signedUploadUrls(inputs: $inputs)
        }
      `,
      variables: { inputs },
      isAuth: true,
    })
    return response.data.signedUploadUrls
  }

  async product(id: string): Promise<GQLProduct | undefined> {
    const products = await this.products([id])
    return products.length === 1 ? products[0] : undefined
  }

  async products(ids?: string[]): Promise<GQLProduct[]> {
    const response = await this.query<{ products: GQLProduct[] }>({
      query: gql`
        query GetProducts($ids: [ID!]) {
          products(ids: $ids) {
            id
            title
            price
            stock
          }
        }
      `,
      variables: { ids },
    })
    return response.data.products
  }

  async cartItem(id: string): Promise<GQLCartItem | undefined> {
    const items = await this.cartItems([id])
    return items.length === 1 ? items[0] : undefined
  }

  async cartItems(ids?: string[]): Promise<GQLCartItem[]> {
    const response = await this.query<{ cartItems: GQLCartItem[] }>({
      query: gql`
        query GetCartItems($ids: [ID!]) {
          cartItems(ids: $ids) {
            id
            uid
            productId
            title
            price
            quantity
          }
        }
      `,
      variables: { ids },
      isAuth: true,
    })
    return response.data.cartItems
  }

  async addCartItems(inputs: GQLAddCartItemInput[]): Promise<GQLEditCartItemResponse[]> {
    const response = await this.mutate<{ addCartItems: GQLEditCartItemResponse[] }>({
      mutation: gql`
        mutation AddCartItems($inputs: [AddCartItemInput!]!) {
          addCartItems(inputs: $inputs) {
            id
            uid
            productId
            title
            price
            quantity
            product {
              id
              stock
            }
          }
        }
      `,
      variables: {
        inputs: inputs.map(item => {
          return {
            productId: item.productId,
            title: item.title,
            price: item.price,
            quantity: item.quantity,
          } as GQLAddCartItemInput
        }),
      },
      isAuth: true,
    })
    return response.data.addCartItems
  }

  async updateCartItems(inputs: GQLUpdateCartItemInput[]): Promise<GQLEditCartItemResponse[]> {
    const response = await this.mutate<{ updateCartItems: GQLEditCartItemResponse[] }>({
      mutation: gql`
        mutation UpdateCartItems($inputs: [UpdateCartItemInput!]!) {
          updateCartItems(inputs: $inputs) {
            id
            uid
            productId
            title
            price
            quantity
            product {
              id
              stock
            }
          }
        }
      `,
      variables: {
        inputs: inputs.map(item => {
          return {
            id: item.id,
            quantity: item.quantity,
          } as GQLUpdateCartItemInput
        }),
      },
      isAuth: true,
    })
    return response.data.updateCartItems
  }

  async removeCartItems(ids: string[]): Promise<GQLEditCartItemResponse[]> {
    const response = await this.mutate<{ removeCartItems: GQLEditCartItemResponse[] }>({
      mutation: gql`
        mutation RemoveCartItems($ids: [ID!]!) {
          removeCartItems(ids: $ids) {
            id
            uid
            productId
            title
            price
            quantity
            product {
              id
              stock
            }
          }
        }
      `,
      variables: { ids },
      isAuth: true,
    })
    return response.data.removeCartItems
  }

  async checkoutCart(): Promise<boolean> {
    const response = await this.mutate<{ checkoutCart: boolean }>({
      mutation: gql`
        mutation CheckoutCart {
          checkoutCart
        }
      `,
      isAuth: true,
    })
    return response.data.checkoutCart
  }
}
