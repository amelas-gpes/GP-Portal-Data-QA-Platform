import { isKnownField } from '../data/columns';
import { getFieldActivationInfo } from '../data/fieldActivation';
import type { BIRow, FormulaMetric, FormulaRegistry, FormulaValidation, LogicVersion } from '../types';
import { MONEY_EPSILON, absSumField, negSumField, safeDivide, sumField } from './aggregation';

type Token =
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'identifier'; value: string }
  | { type: 'operator'; value: string }
  | { type: 'paren'; value: '(' | ')' }
  | { type: 'comma'; value: ',' };

type Ast =
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'unary'; operator: string; argument: Ast }
  | { type: 'binary'; operator: string; left: Ast; right: Ast }
  | { type: 'call'; name: string; args: Ast[] };

const COMPILED_FORMULA_CACHE_LIMIT = 500;
const compiledFormulaCache = new Map<string, Ast>();

type EvalContext = {
  rows: BIRow[];
  /** Rows from inception through the current period bucket; the CUMULATIVE() scope. */
  cumulativeRows: BIRow[];
  registry: FormulaRegistry;
  visualId: string;
  version: LogicVersion;
  stack: string[];
};

export class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaError';
  }
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    const char = input[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '"') {
      let cursor = index + 1;
      let value = '';
      while (cursor < input.length && input[cursor] !== '"') {
        value += input[cursor];
        cursor += 1;
      }
      if (input[cursor] !== '"') throw new FormulaError('Unclosed string literal.');
      tokens.push({ type: 'string', value });
      index = cursor + 1;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      let cursor = index;
      while (cursor < input.length && /[0-9.]/.test(input[cursor])) cursor += 1;
      const value = Number(input.slice(index, cursor));
      if (!Number.isFinite(value)) throw new FormulaError(`Invalid number near "${input.slice(index, cursor)}".`);
      tokens.push({ type: 'number', value });
      index = cursor;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      let cursor = index;
      while (cursor < input.length && /[A-Za-z0-9_]/.test(input[cursor])) cursor += 1;
      tokens.push({ type: 'identifier', value: input.slice(index, cursor).toUpperCase() });
      index = cursor;
      continue;
    }
    const two = input.slice(index, index + 2);
    if (['>=', '<=', '==', '!='].includes(two)) {
      tokens.push({ type: 'operator', value: two });
      index += 2;
      continue;
    }
    if ('+-*/><'.includes(char)) {
      tokens.push({ type: 'operator', value: char });
      index += 1;
      continue;
    }
    if (char === '(' || char === ')') {
      tokens.push({ type: 'paren', value: char });
      index += 1;
      continue;
    }
    if (char === ',') {
      tokens.push({ type: 'comma', value: char });
      index += 1;
      continue;
    }
    throw new FormulaError(`Unexpected character "${char}".`);
  }
  return tokens;
}

export function parseFormula(input: string): Ast {
  return compileFormula(input);
}

export function compileFormula(input: string): Ast {
  const cached = compiledFormulaCache.get(input);
  if (cached) {
    compiledFormulaCache.delete(input);
    compiledFormulaCache.set(input, cached);
    return cached;
  }
  const parser = new Parser(tokenize(input));
  const ast = parser.parseExpression();
  if (!parser.isDone()) throw new FormulaError('Unexpected tokens after end of formula.');
  compiledFormulaCache.set(input, ast);
  if (compiledFormulaCache.size > COMPILED_FORMULA_CACHE_LIMIT) {
    const oldestKey = compiledFormulaCache.keys().next().value;
    if (oldestKey) compiledFormulaCache.delete(oldestKey);
  }
  return ast;
}

export function evaluateFormula(
  formula: string,
  rows: BIRow[],
  registry: FormulaRegistry,
  visualId: string,
  version: LogicVersion,
  stack: string[] = [],
  cumulativeRows: BIRow[] = rows,
): number {
  const ast = parseFormula(formula);
  const value = evalAst(ast, { rows, cumulativeRows, registry, visualId, version, stack });
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function evaluateMetric(
  registry: FormulaRegistry,
  visualId: string,
  metricName: string,
  rows: BIRow[],
  version: LogicVersion,
  stack: string[] = [],
  cumulativeRows: BIRow[] = rows,
): number {
  const metric = findMetric(registry, visualId, metricName);
  if (!metric) return 0;
  if (stack.includes(metric.id)) throw new FormulaError(`Circular metric reference: ${[...stack, metric.id].join(' -> ')}`);
  const formula = version === 'production' ? metric.productionFormula : metric.draftFormula;
  return evaluateFormula(formula, rows, registry, visualId, version, [...stack, metric.id], cumulativeRows);
}

export function validateFormula(
  formula: string,
  registry: FormulaRegistry,
  visualId: string,
  metricId?: string,
): FormulaValidation {
  try {
    const ast = parseFormula(formula);
    const structuralErrors = validateAst(ast);
    const referencedFields = Array.from(collectFields(ast));
    const fieldReferences = referencedFields.map((field) => getFieldActivationInfo(field));
    const referencedMetrics = Array.from(collectMetrics(ast));
    const errors = [
      ...structuralErrors,
      ...referencedFields.filter((field) => !isKnownField(field)).map((field) => `Unknown field: ${field}`),
    ];
    const warnings = fieldReferences
      .filter((field) => field.status === 'needsActivation')
      .map((field) => `${field.header} is imported but not used by current production visual logic.`);
    for (const metricName of referencedMetrics) {
      if (!findMetric(registry, visualId, metricName)) errors.push(`Unknown metric in ${visualId}: ${metricName}`);
    }
    if (metricId) {
      const circular = hasCircularReference(registry, visualId, metricId, formula);
      if (circular) errors.push(`Circular metric reference: ${circular}`);
    }
    return { ok: errors.length === 0, errors, warnings, referencedFields, fieldReferences, referencedMetrics };
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : 'Formula could not be parsed.'],
      warnings: [],
      referencedFields: [],
      fieldReferences: [],
      referencedMetrics: [],
    };
  }
}

export function metricFormula(metric: FormulaMetric, version: LogicVersion): string {
  return version === 'production' ? metric.productionFormula : metric.draftFormula;
}

function evalAst(ast: Ast, context: EvalContext): number | string | boolean {
  switch (ast.type) {
    case 'number':
      return ast.value;
    case 'string':
      return ast.value;
    case 'unary': {
      const value = Number(evalAst(ast.argument, context));
      return ast.operator === '-' ? -value : value;
    }
    case 'binary': {
      const left = evalAst(ast.left, context);
      const right = evalAst(ast.right, context);
      return applyOperator(ast.operator, left, right);
    }
    case 'call':
      return evalCall(ast.name, ast.args, context);
  }
}

function evalCall(name: string, args: Ast[], context: EvalContext): number {
  const numbers = () => args.map((arg) => Number(evalAst(arg, context)));
  const firstString = (kind: 'field' | 'metric') => {
    if (args.length !== 1 || args[0]?.type !== 'string') throw new FormulaError(stringArgumentError(name, kind));
    return args[0].value;
  };
  switch (name) {
    case 'SUM':
      return sumField(context.rows, firstString('field'));
    case 'ABS_SUM':
      return absSumField(context.rows, firstString('field'));
    case 'NEG_SUM':
      return negSumField(context.rows, firstString('field'));
    case 'FIELD':
      return sumField(context.rows, firstString('field'));
    case 'ABS':
      return Math.abs(numbers()[0] ?? 0);
    case 'NEG':
      return -(numbers()[0] ?? 0);
    case 'MAX':
      return Math.max(...numbers());
    case 'MIN':
      return Math.min(...numbers());
    case 'SAFE_DIVIDE': {
      const [numerator, denominator, fallback = 0] = numbers();
      return safeDivide(numerator, denominator, fallback);
    }
    case 'IF': {
      if (args.length !== 3) throw new FormulaError('IF requires condition, true value, and false value.');
      return evalAst(args[0], context) ? Number(evalAst(args[1], context)) : Number(evalAst(args[2], context));
    }
    case 'METRIC':
      return evaluateMetric(context.registry, context.visualId, firstString('metric'), context.rows, context.version, context.stack, context.cumulativeRows);
    case 'CUMULATIVE':
      // Evaluate the referenced metric over every row from inception through the
      // current period bucket, regardless of the global cumulative toggle.
      return evaluateMetric(context.registry, context.visualId, firstString('metric'), context.cumulativeRows, context.version, context.stack, context.cumulativeRows);
    case 'ROUND': {
      const [value, decimals = 0] = numbers();
      const safeDecimals = normalizeRoundDecimals(decimals);
      const factor = 10 ** safeDecimals;
      return Math.round(value * factor) / factor;
    }
    default:
      throw new FormulaError(`Unsupported function: ${name}`);
  }
}

function stringArgumentError(name: string, kind: 'field' | 'metric'): string {
  return `${name} requires one quoted ${kind} name.`;
}

function applyOperator(operator: string, left: number | string | boolean, right: number | string | boolean): number | boolean {
  const a = Number(left);
  const b = Number(right);
  switch (operator) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      // Residue-safe divide-by-zero guard, consistent with SAFE_DIVIDE's default.
      return Math.abs(b) < MONEY_EPSILON ? 0 : a / b;
    case '>':
      return a > b;
    case '<':
      return a < b;
    case '>=':
      return a >= b;
    case '<=':
      return a <= b;
    case '==':
      return a === b;
    case '!=':
      return a !== b;
    default:
      throw new FormulaError(`Unsupported operator: ${operator}`);
  }
}

function validateAst(ast: Ast, errors: string[] = []): string[] {
  if (ast.type === 'call') {
    if (['SUM', 'ABS_SUM', 'NEG_SUM', 'FIELD'].includes(ast.name)) {
      validateStringArgumentCall(ast, 'field', errors);
    } else if (['METRIC', 'CUMULATIVE'].includes(ast.name)) {
      validateStringArgumentCall(ast, 'metric', errors);
    } else if (['ABS', 'NEG'].includes(ast.name)) {
      validateArgumentCount(ast, 1, 1, errors);
    } else if (['MAX', 'MIN'].includes(ast.name)) {
      validateArgumentCount(ast, 1, Infinity, errors);
    } else if (ast.name === 'SAFE_DIVIDE') {
      validateArgumentCount(ast, 2, 3, errors);
    } else if (ast.name === 'IF') {
      validateArgumentCount(ast, 3, 3, errors);
    } else if (ast.name === 'ROUND') {
      validateArgumentCount(ast, 1, 2, errors);
      validateRoundDecimals(ast, errors);
    } else {
      errors.push(`Unsupported function: ${ast.name}`);
    }
    ast.args.forEach((arg) => validateAst(arg, errors));
  } else if (ast.type === 'binary') {
    validateAst(ast.left, errors);
    validateAst(ast.right, errors);
  } else if (ast.type === 'unary') {
    validateAst(ast.argument, errors);
  }
  return errors;
}

function validateRoundDecimals(ast: Extract<Ast, { type: 'call' }>, errors: string[]): void {
  const decimals = ast.args[1];
  if (!decimals || decimals.type !== 'number') return;
  if (isSafeRoundDecimals(decimals.value)) return;
  errors.push('ROUND decimal places must be a whole number from 0 to 6.');
}

function normalizeRoundDecimals(value: number): number {
  // `validateRoundDecimals` rejects out-of-range *literals* so the editor can warn
  // the user. A precision computed at runtime (e.g. ROUND(x, SUM("Field"))) slips
  // past that static check, so clamp it here instead of throwing: an un-evaluable
  // formula must never propagate an exception out of the chart compute and blank
  // the entire dashboard.
  if (!Number.isFinite(value)) return 0;
  return Math.min(6, Math.max(0, Math.round(value)));
}

function isSafeRoundDecimals(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

function validateStringArgumentCall(ast: Extract<Ast, { type: 'call' }>, kind: 'field' | 'metric', errors: string[]): void {
  if (ast.args.length !== 1 || ast.args[0]?.type !== 'string') errors.push(stringArgumentError(ast.name, kind));
}

function validateArgumentCount(ast: Extract<Ast, { type: 'call' }>, min: number, max: number, errors: string[]): void {
  if (ast.args.length >= min && ast.args.length <= max) return;
  errors.push(max === Infinity ? `${ast.name} requires at least ${min} value.` : `${ast.name} requires ${min === max ? min : `${min}-${max}`} value${max === 1 ? '' : 's'}.`);
}

function findMetric(registry: FormulaRegistry, visualId: string, metricName: string): FormulaMetric | null {
  return (
    Object.values(registry).find(
      (metric) =>
        metric.visualId === visualId &&
        (metric.metricName.toLowerCase() === metricName.toLowerCase() || metric.id.toLowerCase() === metricName.toLowerCase()),
    ) ?? null
  );
}

function collectFields(ast: Ast, fields = new Set<string>()): Set<string> {
  if (ast.type === 'call') {
    if (['SUM', 'ABS_SUM', 'NEG_SUM', 'FIELD'].includes(ast.name) && ast.args[0]?.type === 'string') {
      fields.add(ast.args[0].value);
    }
    ast.args.forEach((arg) => collectFields(arg, fields));
  } else if (ast.type === 'binary') {
    collectFields(ast.left, fields);
    collectFields(ast.right, fields);
  } else if (ast.type === 'unary') {
    collectFields(ast.argument, fields);
  }
  return fields;
}

function collectMetrics(ast: Ast, metrics = new Set<string>()): Set<string> {
  if (ast.type === 'call') {
    if (['METRIC', 'CUMULATIVE'].includes(ast.name) && ast.args[0]?.type === 'string') {
      metrics.add(ast.args[0].value);
    }
    ast.args.forEach((arg) => collectMetrics(arg, metrics));
  } else if (ast.type === 'binary') {
    collectMetrics(ast.left, metrics);
    collectMetrics(ast.right, metrics);
  } else if (ast.type === 'unary') {
    collectMetrics(ast.argument, metrics);
  }
  return metrics;
}

function hasCircularReference(registry: FormulaRegistry, visualId: string, metricId: string, candidateFormula: string): string | null {
  const seen = new Set<string>();
  const metric = registry[metricId];
  if (!metric) return null;
  const visit = (formula: string, path: string[]): string | null => {
    const ast = parseFormula(formula);
    const refs = collectMetrics(ast);
    for (const ref of refs) {
      const refMetric = findMetric(registry, visualId, ref);
      if (!refMetric) continue;
      if (refMetric.id === metricId) return [...path, refMetric.metricName].join(' -> ');
      if (!seen.has(refMetric.id)) {
        seen.add(refMetric.id);
        const next = visit(refMetric.draftFormula, [...path, refMetric.metricName]);
        if (next) return next;
      }
    }
    return null;
  };
  return visit(candidateFormula, [metric.metricName]);
}

class Parser {
  private readonly tokens: Token[];
  private position = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parseExpression(): Ast {
    return this.parseComparison();
  }

  isDone(): boolean {
    return this.position >= this.tokens.length;
  }

  private parseComparison(): Ast {
    let expr = this.parseAdditive();
    while (this.matchOperator(['>', '<', '>=', '<=', '==', '!='])) {
      const operator = this.previous().value;
      const right = this.parseAdditive();
      expr = { type: 'binary', operator, left: expr, right };
    }
    return expr;
  }

  private parseAdditive(): Ast {
    let expr = this.parseMultiplicative();
    while (this.matchOperator(['+', '-'])) {
      const operator = this.previous().value;
      const right = this.parseMultiplicative();
      expr = { type: 'binary', operator, left: expr, right };
    }
    return expr;
  }

  private parseMultiplicative(): Ast {
    let expr = this.parseUnary();
    while (this.matchOperator(['*', '/'])) {
      const operator = this.previous().value;
      const right = this.parseUnary();
      expr = { type: 'binary', operator, left: expr, right };
    }
    return expr;
  }

  private parseUnary(): Ast {
    if (this.matchOperator(['+', '-'])) {
      return { type: 'unary', operator: this.previous().value, argument: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Ast {
    const token = this.advance();
    if (!token) throw new FormulaError('Unexpected end of formula.');
    if (token.type === 'number') return { type: 'number', value: token.value };
    if (token.type === 'string') return { type: 'string', value: token.value };
    if (token.type === 'identifier') {
      this.consumeParen('(');
      const args: Ast[] = [];
      if (!this.checkParen(')')) {
        do {
          args.push(this.parseExpression());
        } while (this.matchComma());
      }
      this.consumeParen(')');
      return { type: 'call', name: token.value, args };
    }
    if (token.type === 'paren' && token.value === '(') {
      const expr = this.parseExpression();
      this.consumeParen(')');
      return expr;
    }
    throw new FormulaError('Expected number, string, function call, or parenthesized expression.');
  }

  private matchOperator(operators: string[]): boolean {
    const token = this.peek();
    if (token?.type === 'operator' && operators.includes(token.value)) {
      this.position += 1;
      return true;
    }
    return false;
  }

  private matchComma(): boolean {
    if (this.peek()?.type === 'comma') {
      this.position += 1;
      return true;
    }
    return false;
  }

  private consumeParen(value: '(' | ')'): void {
    if (!this.checkParen(value)) throw new FormulaError(`Expected "${value}".`);
    this.position += 1;
  }

  private checkParen(value: '(' | ')'): boolean {
    const token = this.peek();
    return token?.type === 'paren' && token.value === value;
  }

  private advance(): Token | undefined {
    const token = this.tokens[this.position];
    this.position += 1;
    return token;
  }

  private previous(): Token & { type: 'operator' } {
    return this.tokens[this.position - 1] as Token & { type: 'operator' };
  }

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }
}
