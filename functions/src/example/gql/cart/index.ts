import * as path from 'path'
import { Args, GraphQLModule, Mutation, Query, Resolver } from '@nestjs/graphql'
import { AuthGuard, AuthGuardModule, IdToken, User } from '../../../lib'
import { BaseGQLModule, getGQLModuleOptions } from '../base'
import { CartItem, CartItemAddInput, CartItemEditResponse, CartItemUpdateInput, CartServiceDI, CartServiceModule } from '../../services'
import { Inject, UseGuards } from '@nestjs/common'
import { Module } from '@nestjs/common'
import { config } from '../../../config'

@Resolver('CartItem')
@UseGuards(AuthGuard)
export class CartResolver {
  constructor(@Inject(CartServiceDI.symbol) protected readonly cartService: CartServiceDI.type) {}

  @Query()
  async cartItems(@User() user: IdToken, @Args('ids') ids?: string[]): Promise<CartItem[]> {
    return this.cartService.findList(user, ids)
  }

  @Mutation()
  async updateCartItems(@User() user: IdToken, @Args('inputs') inputs: CartItemUpdateInput[]): Promise<CartItemEditResponse[]> {
    return this.cartService.updateList(user, inputs)
  }

  @Mutation()
  async addCartItems(@User() user: IdToken, @Args('inputs') inputs: CartItemAddInput[]): Promise<CartItemEditResponse[]> {
    return this.cartService.addList(user, inputs)
  }

  @Mutation()
  async removeCartItems(@User() user: IdToken, @Args('ids') ids: string[]): Promise<CartItemEditResponse[]> {
    return this.cartService.removeList(user, ids)
  }

  @Mutation()
  async checkoutCart(@User() user: IdToken): Promise<boolean> {
    return this.cartService.checkoutCart(user)
  }
}

const schemaFile = `${path.join(config.gql.schema.moduleDir, 'cart/cart.graphql')}`

@Module({
  providers: [CartResolver],
  imports: [BaseGQLModule, GraphQLModule.forRoot(getGQLModuleOptions([schemaFile])), CartServiceModule, AuthGuardModule],
})
export default class CartGQLModule {}
