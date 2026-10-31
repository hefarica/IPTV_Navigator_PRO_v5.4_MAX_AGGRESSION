'use strict';

/**
 * Minimal, dependency-free JSON-Schema subset validator used by the ARA-X tests.
 * Supported keywords: type, enum, required, properties, additionalProperties,
 * items, minItems, maxItems, minProperties, maxProperties, minimum, maximum,
 * minLength, maxLength, pattern.
 *
 * It is intentionally small: enough to validate the two ARA-X schemas, not a
 * general-purpose JSON-Schema engine.
 */

function typeName(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function matchesType(value, expected) {
  if (Array.isArray(expected)) return expected.some((t) => matchesType(value, t));
  switch (expected) {
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'integer':
      return Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return true;
  }
}

function validate(data, schema, path = '$', errors = []) {
  if (!schema || typeof schema !== 'object') return errors;

  if (schema.type !== undefined && !matchesType(data, schema.type)) {
    errors.push(path + ': expected type ' + JSON.stringify(schema.type) + ', got ' + typeName(data));
    return errors;
  }

  if (schema.enum !== undefined && !schema.enum.some((item) => Object.is(item, data))) {
    errors.push(path + ': value not in enum');
  }

  if (typeName(data) === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) errors.push(path + ': below minimum ' + schema.minimum);
    if (schema.maximum !== undefined && data > schema.maximum) errors.push(path + ': above maximum ' + schema.maximum);
  }

  if (typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength) errors.push(path + ': shorter than minLength ' + schema.minLength);
    if (schema.maxLength !== undefined && data.length > schema.maxLength) errors.push(path + ': longer than maxLength ' + schema.maxLength);
    if (schema.pattern !== undefined) {
      let re;
      try {
        re = new RegExp(schema.pattern);
      } catch {
        errors.push(path + ': invalid pattern in schema');
      }
      if (re && !re.test(data)) errors.push(path + ': does not match pattern ' + schema.pattern);
    }
  }

  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) errors.push(path + ': fewer than minItems ' + schema.minItems);
    if (schema.maxItems !== undefined && data.length > schema.maxItems) errors.push(path + ': more than maxItems ' + schema.maxItems);
    if (schema.items !== undefined) {
      data.forEach((item, i) => validate(item, schema.items, path + '[' + i + ']', errors));
    }
    return errors;
  }

  if (data !== null && typeof data === 'object') {
    const keys = Object.keys(data);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) errors.push(path + ': fewer than minProperties ' + schema.minProperties);
    if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) errors.push(path + ': more than maxProperties ' + schema.maxProperties);

    if (schema.required !== undefined) {
      for (const key of schema.required) {
        if (!Object.prototype.hasOwnProperty.call(data, key)) errors.push(path + ': missing required property ' + key);
      }
    }

    const props = schema.properties || {};
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(props, key)) {
        validate(data[key], props[key], path + '.' + key, errors);
      } else if (schema.additionalProperties === false) {
        errors.push(path + ': unexpected property ' + key);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        validate(data[key], schema.additionalProperties, path + '.' + key, errors);
      }
    }
  }

  return errors;
}

function assertValid(data, schema, label = 'value') {
  const errors = validate(data, schema);
  if (errors.length > 0) {
    const err = new Error(label + ' failed schema validation:\n - ' + errors.join('\n - '));
    err.code = 'ARA_X_SCHEMA_INVALID';
    err.errors = errors;
    throw err;
  }
  return true;
}

module.exports = { validate, assertValid, matchesType, typeName };
