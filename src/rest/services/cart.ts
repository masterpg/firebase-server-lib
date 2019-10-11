import { InputValidationError, validate } from '../../base/validator'
import { IsOptional, IsPositive } from 'class-validator'
import { CartItem } from './types'
import { IdToken } from '../../services/base'
import { Injectable } from '@nestjs/common'

const CART_ITEMS: CartItem[] = [
  {
    id: 'cartItem1',
    uid: '',
    productId: 'product1',
    title: 'iPad 4 Mini',
    price: 500.01,
    quantity: 1,
  },
  {
    id: 'cartItem2',
    uid: '',
    productId: 'product2',
    title: 'Fire HD 8 Tablet',
    price: 80.99,
    quantity: 2,
  },
]

export class UpdateCartItem {
  @IsOptional()
  @IsPositive()
  price!: number

  @IsOptional()
  @IsPositive()
  quantity!: number
}

@Injectable()
class CartService {
  async findAll(user: IdToken): Promise<CartItem[]> {
    return CART_ITEMS.map(item => {
      item.uid = user.uid
      return item
    })
  }

  async findOne(user: IdToken, id: string): Promise<CartItem | undefined> {
    const cartItem = CART_ITEMS.find(item => item.id === id)
    if (!cartItem) {
      throw new InputValidationError('Cart item was not found.', { cartId: id })
    }
    cartItem.uid = user.uid
    return cartItem
  }

  async update(user: IdToken, id: string, input: UpdateCartItem) {
    await validate(UpdateCartItem, input)
    const cartItem = CART_ITEMS.find(item => item.id === id)
    if (!cartItem) {
      throw new InputValidationError('Cart item was not found.', { cartId: id })
    }
    cartItem.uid = user.uid
    cartItem.quantity = input.quantity
    return cartItem
  }
}

export namespace CartServiceDI {
  export const symbol = Symbol(CartService.name)
  export const provider = {
    provide: symbol,
    useClass: CartService,
  }
  export type type = CartService
}
