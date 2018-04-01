import Shop from '../../api/shop';
import { ADD_PRODUCT_TO_CART, BaseManager, CartGetters, CartProduct, CartState, CHECKOUT, DECREMENT_PRODUCT_INVENTORY, INCREMENT_ITEM_QUANTITY, Product, PUSH_PRODUCT_TO_CART, RootState, SET_CART_ITEMS, SET_CHECKOUT_STATUS } from "./base";
import { ActionContext } from "vuex";

//================================================================================
//
//  Module
//
//================================================================================

//----------------------------------------------------------------------
//
//  State
//
//----------------------------------------------------------------------

const state: CartState = {
  added: [],
  checkoutStatus: null,
};

//----------------------------------------------------------------------
//
//  Getters
//
//----------------------------------------------------------------------

const getters = {
  checkoutStatus(state: CartState): string | null {
    return state.checkoutStatus;
  },

  cartProducts(state: CartState, getters: CartGetters, rootState: RootState): CartProduct[] {
    return state.added.map(({ id, quantity }) => {
      const product = rootState.products.all.find(product => product.id === id);
      return {
        id: product!.id,
        title: product!.title,
        price: product!.price,
        quantity,
      };
    });
  },

  cartTotalPrice(state: CartState, getters: CartGetters): number {
    return getters.cartProducts.reduce((total, product) => {
      return total + product.price * product.quantity;
    }, 0);
  },
};

//----------------------------------------------------------------------
//
//  Actions
//
//----------------------------------------------------------------------

const actions = {
  [CHECKOUT](context: ActionContext<CartState, RootState>, products: Product[]): Promise<void> {
    const savedCartItems = [...state.added];
    context.commit(SET_CHECKOUT_STATUS, null);
    // empty cart
    context.commit(SET_CART_ITEMS, { items: [] });

    return Shop.buyProducts(products).then(() => {
      context.commit(SET_CHECKOUT_STATUS, 'successful');
    }).catch(err => {
      context.commit(SET_CHECKOUT_STATUS, 'failed');
      // rollback to the cart saved before sending the request
      context.commit(SET_CART_ITEMS, { items: savedCartItems });
    });
  },

  [ADD_PRODUCT_TO_CART](context: ActionContext<CartState, RootState>, product: Product): Promise<void> {
    return new Promise((resolve) => {
      context.commit(SET_CHECKOUT_STATUS, null);
      if (product.inventory > 0) {
        const cartItem = state.added.find(item => item.id === product.id);
        if (!cartItem) {
          context.commit(PUSH_PRODUCT_TO_CART, { id: product.id });
        } else {
          context.commit(INCREMENT_ITEM_QUANTITY, cartItem);
        }
        // remove 1 item from stock
        context.commit(DECREMENT_PRODUCT_INVENTORY, { id: product.id });
      }
      resolve();
    });
  },
};

//----------------------------------------------------------------------
//
//  Mutations
//
//----------------------------------------------------------------------

const mutations = {
  [PUSH_PRODUCT_TO_CART](state: CartState, { id }: { id: number }) {
    state.added.push({
      id,
      quantity: 1,
    });
  },

  [INCREMENT_ITEM_QUANTITY](state: CartState, { id }: { id: number }) {
    const cartItem = state.added.find(item => item.id === id);
    if (cartItem) {
      cartItem.quantity++;
    }
  },

  [SET_CART_ITEMS](state: CartState, { items }: { items: { id: number, quantity: number }[] }) {
    state.added = items;
  },

  [SET_CHECKOUT_STATUS](state: CartState, status: string | null) {
    state.checkoutStatus = status;
  },
};

//----------------------------------------------------------------------
//
//  Export
//
//----------------------------------------------------------------------

export const CartModule = {
  state,
  getters,
  actions,
  mutations,
};

//================================================================================
//
//  Manager
//
//================================================================================

export class CartManager extends BaseManager implements CartState, CartGetters {

  get added(): { id: number, quantity: number }[] { return this.store.state.cart.added; }

  get checkoutStatus(): string | null { return (<CartGetters>this.store.getters).checkoutStatus; }

  get cartProducts(): CartProduct[] { return (<CartGetters>this.store.getters).cartProducts; }

  get cartTotalPrice(): number { return (<CartGetters>this.store.getters).cartTotalPrice; }

  addProductToCart(product: Product): Promise<void> {
    return this.store.dispatch(ADD_PRODUCT_TO_CART, product);
  }

  checkout(products: Product[]): Promise<void> {
    return this.store.dispatch(CHECKOUT, products);
  }
}
