import { CustomScalar, Scalar } from '@nestjs/graphql'
import { Dayjs } from 'dayjs'
import { Kind } from 'graphql'
import dayjs = require('dayjs')

@Scalar('DateTime')
export class DateTimeScalar implements CustomScalar<string, Dayjs | null> {
  description = 'DateTime custom scalar type'

  parseValue(value: string): Dayjs {
    return dayjs(value) // value from the client
  }

  serialize(value: Dayjs): string {
    return value.toISOString() // value sent to the client
  }

  parseLiteral(ast: any): Dayjs | null {
    if (ast.kind === Kind.STRING) {
      return dayjs(ast.value)
    }
    return null
  }
}
