import { ValidatorOptions, ValidationError as _ValidationError, validate as _validate, validateSync as _validateSync } from 'class-validator'
import { BadRequestException } from '@nestjs/common'
import { Constructor } from 'web-base-lib'
import { plainToClass } from 'class-transformer'

//========================================================================
//
//  Implementation
//
//========================================================================

class ValidationErrors extends BadRequestException {
  constructor(readonly details: _ValidationError[]) {
    super('Validation failed.')
  }
}

async function validate(objectClass: Constructor, object: any, validatorOptions?: ValidatorOptions): Promise<void>

async function validate(objectClass: Constructor, object: any[], validatorOptions?: ValidatorOptions): Promise<void>

async function validate(objectClass: Constructor, objectOrObjects: any | any[], validatorOptions?: ValidatorOptions): Promise<void> {
  if (Array.isArray(objectOrObjects)) {
    const errors: _ValidationError[] = []
    const promises: Promise<void>[] = []
    for (const object of objectOrObjects) {
      promises.push(
        _validate(plainToClass(objectClass, object), validatorOptions).then(errs => {
          errors.push(...errs)
        })
      )
    }
    await Promise.all(promises)
    if (errors.length) {
      throw new ValidationErrors(errors)
    }
  } else {
    const errors = await _validate(plainToClass(objectClass, objectOrObjects), validatorOptions)
    if (errors.length) {
      throw new ValidationErrors(errors)
    }
  }
}

function validateSync(objectClass: Constructor, object: any, validatorOptions?: ValidatorOptions): void

function validateSync(objectClass: Constructor, object: any[], validatorOptions?: ValidatorOptions): void

function validateSync(objectClass: Constructor, objectOrObjects: any | any[], validatorOptions?: ValidatorOptions): void {
  if (Array.isArray(objectOrObjects)) {
    for (const object of objectOrObjects) {
      const validated = _validateSync(plainToClass(objectClass, object), validatorOptions)
      if (validated.length > 0) {
        throw validated
      }
    }
  } else {
    const validated = _validateSync(plainToClass(objectClass, objectClass), validatorOptions)
    if (validated.length > 0) {
      throw validated
    }
  }
}

/**
 * ユーザーIDを検証します。
 * @param uid
 */
function validateUID(uid: string): boolean {
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789\\.\\-_'
  const ERR_PATTERN = new RegExp(`[^${CHARS}]+`)

  if (uid.length > 20) return false
  if (!uid) return false
  if (ERR_PATTERN.test(uid)) return false
  return true
}

//========================================================================
//
//  Exports
//
//========================================================================

export { ValidationErrors, validate, validateSync, validateUID }
