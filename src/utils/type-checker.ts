/**
 * Type Checker Utilities
 *
 * Utilities for leveraging TypeScript's type checker to perform
 * control-flow-sensitive analysis of Result types.
 *
 * This allows us to detect type narrowing (e.g., after early returns)
 * that simple pattern matching cannot detect.
 */

import type { Node, Type } from 'ts-morph';
import { Node as TsMorphNode } from 'ts-morph';

/**
 * Check if a type represents a narrowed Result type with ok: true
 *
 * After control flow narrowing (e.g., `if (isErr(x)) return`),
 * TypeScript narrows the Result<T, E> union type from:
 *   { ok: true, value: T } | { ok: false, error: E }
 * to:
 *   { ok: true, value: T }
 *
 * We detect this by checking if the 'ok' property has a literal type of true.
 */
export function isResultTypeNarrowedToOk(type: Type): boolean {
  // Get all properties of the type
  const properties = type.getProperties();
  const okProperty = properties.find((p) => p.getName() === 'ok');

  if (!okProperty) {
    return false;
  }

  // Get the type of the 'ok' property at this location
  const declarations = okProperty.getDeclarations();
  if (declarations.length === 0) {
    return false;
  }

  const firstDeclaration = declarations[0];
  if (!firstDeclaration) {
    return false;
  }

  const okType = firstDeclaration.getType();

  // Check if it's a literal 'true' type using compiler type intrinsicName
  // After narrowing: ok: true (intrinsicName = 'true')
  // Before narrowing: ok: boolean (union, no single intrinsicName)
  const compilerType = okType.compilerType as { intrinsicName?: string } | undefined;
  if (compilerType?.intrinsicName === 'true') {
    return true;
  }

  return false;
}

/**
 * Check if a type represents a narrowed Result type with ok: false
 *
 * After control flow narrowing (e.g., `if (isOk(x)) return`),
 * TypeScript narrows the Result<T, E> union type from:
 *   { ok: true, value: T } | { ok: false, error: E }
 * to:
 *   { ok: false, error: E }
 *
 * We detect this by checking if the 'ok' property has a literal type of false.
 */
export function isResultTypeNarrowedToErr(type: Type): boolean {
  const properties = type.getProperties();
  const okProperty = properties.find((p) => p.getName() === 'ok');

  if (!okProperty) {
    return false;
  }

  const declarations = okProperty.getDeclarations();
  if (declarations.length === 0) {
    return false;
  }

  const firstDeclaration = declarations[0];
  if (!firstDeclaration) {
    return false;
  }

  const okType = firstDeclaration.getType();

  // After narrowing: ok: false (intrinsicName = 'false')
  // Before narrowing: ok: boolean (union, no single intrinsicName)
  const compilerType = okType.compilerType as { intrinsicName?: string } | undefined;
  if (compilerType?.intrinsicName === 'false') {
    return true;
  }

  return false;
}

/**
 * Get the type of a node accounting for control flow narrowing
 */
export function getTypeAtLocation(node: Node): Type {
  return node.getType();
}

/**
 * Check if a node is inside a type-guarded block
 *
 * Fallback heuristic for when type checking isn't available.
 */
export function isInsideTypeGuard(node: Node): boolean {
  let current: Node | undefined = node;

  while (current) {
    if (TsMorphNode.isIfStatement(current)) {
      const condition = current.getExpression();
      const conditionText = condition.getText();

      if (
        conditionText.includes('Result.isOk(') ||
        conditionText.includes('Result.isErr(') ||
        conditionText.includes('isOk(') ||
        conditionText.includes('isErr(')
      ) {
        return true;
      }
    }

    current = current.getParent();
  }

  return false;
}

/**
 * Check if accessing .value on a Result is safe
 *
 * Returns true if either:
 * 1. TypeScript has narrowed the type to { ok: true }
 * 2. We can detect a type guard in the control flow
 */
export function isValueAccessSafe(valueAccessNode: Node): boolean {
  // Strategy 1: Use TypeScript's type checker (most accurate)
  try {
    // Get the expression being accessed (e.g., "result" in "result.value")
    const expression = valueAccessNode.getFirstChild();
    if (!expression) {
      return false;
    }

    const type = getTypeAtLocation(expression);
    if (isResultTypeNarrowedToOk(type)) {
      return true;
    }
  } catch (_error) {
    // Type checking might fail in some edge cases
    // Fall through to heuristic approach
  }

  // Strategy 2: Heuristic fallback (look for guards)
  return isInsideTypeGuard(valueAccessNode);
}

/**
 * Check if accessing .error on a Result is safe
 *
 * Returns true if either:
 * 1. TypeScript has narrowed the type to { ok: false }
 * 2. We can detect a type guard in the control flow
 */
export function isErrorAccessSafe(errorAccessNode: Node): boolean {
  // Strategy 1: Use TypeScript's type checker (most accurate)
  try {
    // Get the expression being accessed (e.g., "result" in "result.error")
    const expression = errorAccessNode.getFirstChild();
    if (!expression) {
      return false;
    }

    const type = getTypeAtLocation(expression);
    if (isResultTypeNarrowedToErr(type)) {
      return true;
    }
  } catch (_error) {
    // Type checking might fail in some edge cases
    // Fall through to heuristic approach
  }

  // Strategy 2: Heuristic fallback (look for guards)
  return isInsideTypeGuard(errorAccessNode);
}
