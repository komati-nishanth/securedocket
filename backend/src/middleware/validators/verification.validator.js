const { body, param } = require('express-validator');
const handleValidationErrors = require('./handleValidation');

const validateDocumentIdParam = [
  param('id')
    .isMongoId()
    .withMessage('Document ID must be a valid 24-character hexadecimal MongoDB ObjectId'),
  handleValidationErrors,
];

const validateFieldCorrection = [
  param('id')
    .isMongoId()
    .withMessage('Document ID must be a valid MongoDB ObjectId'),
  body('fieldName')
    .trim()
    .notEmpty()
    .withMessage('fieldName is required for field correction'),
  body('correctedValue')
    .exists()
    .withMessage('correctedValue is required'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Correction justification note must not exceed 500 characters'),
  handleValidationErrors,
];

const validateFieldApproval = [
  param('id')
    .isMongoId()
    .withMessage('Document ID must be a valid MongoDB ObjectId'),
  body('fieldName')
    .trim()
    .notEmpty()
    .withMessage('fieldName is required for field approval'),
  handleValidationErrors,
];

const validateFlagDocument = [
  param('id')
    .isMongoId()
    .withMessage('Document ID must be a valid MongoDB ObjectId'),
  body('reason')
    .trim()
    .notEmpty()
    .withMessage('Reason is required for flagging a document')
    .isLength({ min: 5, max: 1000 })
    .withMessage('Reason must be between 5 and 1000 characters explaining the integrity or evidentiary issue'),
  handleValidationErrors,
];

module.exports = {
  validateDocumentIdParam,
  validateFieldCorrection,
  validateFieldApproval,
  validateFlagDocument,
};
