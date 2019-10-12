"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const class_validator_1 = require("class-validator");
const common_1 = require("@nestjs/common");
const class_transformer_1 = require("class-transformer");
class ValidationErrors extends common_1.BadRequestException {
    constructor(detail) {
        super('Validation failed.');
        this.detail = detail;
    }
}
exports.ValidationErrors = ValidationErrors;
class InputValidationError extends common_1.BadRequestException {
    constructor(message, values) {
        super('Validation failed.');
        this.m_detail = { message, values };
    }
    get detail() {
        return this.m_detail;
    }
}
exports.InputValidationError = InputValidationError;
async function validate(objectClass, objectOrObjects, validatorOptions) {
    if (Array.isArray(objectOrObjects)) {
        const errors = [];
        const promises = [];
        for (const object of objectOrObjects) {
            promises.push(class_validator_1.validate(class_transformer_1.plainToClass(objectClass, object), validatorOptions).then(errs => {
                errors.push(...errs);
            }));
        }
        await Promise.all(promises);
        if (errors.length) {
            throw new ValidationErrors(errors);
        }
    }
    else {
        const errors = await class_validator_1.validate(class_transformer_1.plainToClass(objectClass, objectOrObjects), validatorOptions);
        if (errors.length) {
            throw new ValidationErrors(errors);
        }
    }
}
exports.validate = validate;
function validateSync(objectClass, objectOrObjects, validatorOptions) {
    if (Array.isArray(objectOrObjects)) {
        for (const object of objectOrObjects) {
            const validated = class_validator_1.validateSync(class_transformer_1.plainToClass(objectClass, object), validatorOptions);
            if (validated.length > 0) {
                throw validated;
            }
        }
    }
    else {
        const validated = class_validator_1.validateSync(class_transformer_1.plainToClass(objectClass, objectClass), validatorOptions);
        if (validated.length > 0) {
            throw validated;
        }
    }
}
exports.validateSync = validateSync;
//# sourceMappingURL=validator.js.map