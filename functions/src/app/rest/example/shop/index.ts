import { AuthGuard, UserArg } from '../../../nest'
import { AuthServiceModule, ExampleShopServiceDI, ExampleShopServiceModule, IdToken, Product } from '../../../services'
import { Body, Controller, Delete, Get, Inject, Module, Post, Put, Query, UseGuards } from '@nestjs/common'
import { CartItem, CartItemAddInput, CartItemEditResponse, CartItemUpdateInput } from '../../../services'
import { BaseRESTModule } from '../../base'

//========================================================================
//
//  Implementation
//
//========================================================================

@Controller('example/shop')
class ExampleShopController {
  constructor(@Inject(ExampleShopServiceDI.symbol) protected readonly shopService: ExampleShopServiceDI.type) {}

  @Get('products')
  async getProducts(@Query('ids') ids?: string[]): Promise<Product[]> {
    return this.shopService.getProducts(ids)
  }

  @Get('cartItems')
  @UseGuards(AuthGuard)
  async getCartItems(@UserArg() user: IdToken, @Query('ids') ids?: string[]): Promise<CartItem[]> {
    return this.shopService.getCartItems(user, ids)
  }

  @Put('cartItems')
  @UseGuards(AuthGuard)
  async updateCartItems(@UserArg() user: IdToken, @Body() inputs: CartItemUpdateInput[]): Promise<CartItemEditResponse[]> {
    return await this.shopService.updateCartItems(user, inputs)
  }

  @Post('cartItems')
  @UseGuards(AuthGuard)
  async addCartItems(@UserArg() user: IdToken, @Body() inputs: CartItemAddInput[]): Promise<CartItemEditResponse[]> {
    return await this.shopService.addCartItems(user, inputs)
  }

  @Delete('cartItems')
  @UseGuards(AuthGuard)
  async removeCartItems(@UserArg() user: IdToken, @Query('ids') ids: string[]): Promise<CartItemEditResponse[]> {
    return await this.shopService.removeCartItems(user, ids)
  }

  @Put('checkoutCart')
  @UseGuards(AuthGuard)
  async checkoutCart(@UserArg() user: IdToken): Promise<boolean> {
    return await this.shopService.checkoutCart(user)
  }
}

@Module({
  controllers: [ExampleShopController],
  imports: [BaseRESTModule, AuthServiceModule, ExampleShopServiceModule],
})
class ExampleShopRESTModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { ExampleShopRESTModule }
