import { IsInt, IsNotEmpty, IsPositive } from 'class-validator'
import { ValidationErrors, validate } from '../../../../../src/lib'
const has = require('lodash/has')

export class CreateProductInput {
  @IsNotEmpty()
  id!: string

  @IsNotEmpty()
  title!: string

  @IsPositive()
  price!: number

  @IsPositive()
  @IsInt()
  stock!: number
}

describe('validator', () => {
  describe('validate', () => {
    it('検証対象が単一の場合', async () => {
      const value = { id: 'product1', title: 'iPad 4 Mini', price: -500, stock: 0.1 }

      let actual!: ValidationErrors
      try {
        await validate(CreateProductInput, value)
      } catch (err) {
        actual = err
      }

      expect(actual.detail.length).toBe(2)
      expect(has(actual.detail[0].constraints, 'isPositive')).toBeTruthy()
      expect(has(actual.detail[1].constraints, 'isInt')).toBeTruthy()
    })

    it('検証対象が配列の場合', async () => {
      const values = [
        { id: 'product1', title: 'iPad 4 Mini', price: -500, stock: 0.1 },
        { id: '', title: 'Fire HD 8 Tablet', price: 80.99, stock: 5 },
      ]

      let actual!: ValidationErrors
      try {
        await validate(CreateProductInput, values)
      } catch (err) {
        actual = err
      }

      expect(actual.detail.length).toBe(3)
      expect(has(actual.detail[0].constraints, 'isPositive')).toBeTruthy()
      expect(has(actual.detail[1].constraints, 'isInt')).toBeTruthy()
      expect(has(actual.detail[2].constraints, 'isNotEmpty')).toBeTruthy()
    })
  })
})
