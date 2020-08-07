//
// 本スカラーは次のコードを参照して作成されています:
// https://github.com/chadlieberman/graphql-type-long/blob/master/lib/index.js
//
import { CustomScalar, Scalar } from '@nestjs/graphql'
import { Kind } from 'graphql'

const MAX_LONG = Number.MAX_SAFE_INTEGER
const MIN_LONG = Number.MIN_SAFE_INTEGER

@Scalar('Long')
export class LongScalar implements CustomScalar<number, number | null> {
  description = 'The `Long` scalar type represents 52-bit integers'

  parseValue(value: number): number {
    // value from the client
    return this.m_coerceLong(value)
  }

  serialize(value: number): number {
    // value sent to the client
    return this.m_coerceLong(value)
  }

  parseLiteral(ast: any): number | null {
    if (ast.kind === Kind.INT) {
      const num = parseInt(ast.value, 10)
      if (num <= MAX_LONG && num >= MIN_LONG) {
        return num
      }
      return null
    }
    return null
  }

  private m_coerceLong(value: any): number {
    if (value === '') {
      throw new TypeError('Long cannot represent non 52-bit signed integer value: (empty string)')
    }

    const num = Number(value)
    if (num === num && num <= MAX_LONG && num >= MIN_LONG) {
      if (num < 0) {
        return Math.ceil(num)
      } else {
        return Math.floor(num)
      }
    }
    throw new TypeError(`Long cannot represent non 52-bit signed integer value: ${String(value)}`)
  }
}
