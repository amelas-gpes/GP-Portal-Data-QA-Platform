export type FormulaDiffTokenStatus = 'unchanged' | 'added' | 'removed';

export type FormulaDiffToken = {
  value: string;
  normalized: string;
  status: FormulaDiffTokenStatus;
};

export type FormulaFunctionChange = {
  name: string;
  productionCount: number;
  draftCount: number;
  status: 'added' | 'removed' | 'changed';
  label: string;
};

export type FormulaDiffResult = {
  hasChanges: boolean;
  tokenChangeCount: number;
  productionTokens: FormulaDiffToken[];
  draftTokens: FormulaDiffToken[];
  addedFields: string[];
  removedFields: string[];
  unchangedFields: string[];
  changedFunctions: FormulaFunctionChange[];
  impactSummary: string;
};

type DiffToken = {
  value: string;
  normalized: string;
};

type FormulaFacts = {
  fields: Set<string>;
  functions: Map<string, number>;
};

const FIELD_FUNCTIONS = new Set(['SUM', 'ABS_SUM', 'NEG_SUM', 'FIELD']);
const FUNCTION_WITH_SIGN_IMPACT = new Set(['ABS', 'ABS_SUM', 'NEG', 'NEG_SUM']);
const FUNCTION_WITH_RATIO_IMPACT = new Set(['SAFE_DIVIDE', 'ROUND']);
const FUNCTION_WITH_DEPENDENCY_IMPACT = new Set(['METRIC', 'CUMULATIVE']);

export function diffFormula(productionFormula: string, draftFormula: string): FormulaDiffResult {
  const effectiveDraftFormula = draftFormula.trim() ? draftFormula : productionFormula;
  const production = tokenizeFormulaForDiff(productionFormula);
  const draft = tokenizeFormulaForDiff(effectiveDraftFormula);
  const { productionTokens, draftTokens } = alignTokenDiff(production, draft);
  const productionFacts = collectFormulaFacts(production);
  const draftFacts = collectFormulaFacts(draft);
  const addedFields = sortedDifference(draftFacts.fields, productionFacts.fields);
  const removedFields = sortedDifference(productionFacts.fields, draftFacts.fields);
  const unchangedFields = sortedIntersection(productionFacts.fields, draftFacts.fields);
  const changedFunctions = changedFunctionList(productionFacts.functions, draftFacts.functions);
  const tokenChangeCount =
    productionTokens.filter((token) => token.status === 'removed').length +
    draftTokens.filter((token) => token.status === 'added').length;

  return {
    hasChanges: productionFormula.trim() !== effectiveDraftFormula.trim(),
    tokenChangeCount,
    productionTokens,
    draftTokens,
    addedFields,
    removedFields,
    unchangedFields,
    changedFunctions,
    impactSummary: summarizeImpact({
      hasChanges: productionFormula.trim() !== effectiveDraftFormula.trim(),
      tokenChangeCount,
      addedFields,
      removedFields,
      changedFunctions,
    }),
  };
}

function tokenizeFormulaForDiff(formula: string): DiffToken[] {
  const tokens: DiffToken[] = [];
  let index = 0;
  while (index < formula.length) {
    const char = formula[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '"') {
      let cursor = index + 1;
      let value = '';
      while (cursor < formula.length && formula[cursor] !== '"') {
        value += formula[cursor];
        cursor += 1;
      }
      const closed = formula[cursor] === '"';
      tokens.push({
        value: closed ? `"${value}"` : `"${value}`,
        normalized: `string:${value}`,
      });
      index = closed ? cursor + 1 : cursor;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      let cursor = index;
      while (cursor < formula.length && /[0-9.]/.test(formula[cursor])) cursor += 1;
      const value = formula.slice(index, cursor);
      tokens.push({ value, normalized: `number:${value}` });
      index = cursor;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      let cursor = index;
      while (cursor < formula.length && /[A-Za-z0-9_]/.test(formula[cursor])) cursor += 1;
      const value = formula.slice(index, cursor).toUpperCase();
      tokens.push({ value, normalized: `identifier:${value}` });
      index = cursor;
      continue;
    }
    const two = formula.slice(index, index + 2);
    if (['>=', '<=', '==', '!='].includes(two)) {
      tokens.push({ value: two, normalized: `operator:${two}` });
      index += 2;
      continue;
    }
    tokens.push({ value: char, normalized: `symbol:${char}` });
    index += 1;
  }
  return tokens;
}

function alignTokenDiff(production: DiffToken[], draft: DiffToken[]) {
  const table = longestCommonSubsequenceTable(production, draft);
  const productionTokens: FormulaDiffToken[] = [];
  const draftTokens: FormulaDiffToken[] = [];
  let productionIndex = 0;
  let draftIndex = 0;

  while (productionIndex < production.length || draftIndex < draft.length) {
    const productionToken = production[productionIndex];
    const draftToken = draft[draftIndex];
    if (productionToken && draftToken && productionToken.normalized === draftToken.normalized) {
      productionTokens.push({ ...productionToken, status: 'unchanged' });
      draftTokens.push({ ...draftToken, status: 'unchanged' });
      productionIndex += 1;
      draftIndex += 1;
    } else if (draftToken && (!productionToken || table[productionIndex][draftIndex + 1] >= table[productionIndex + 1][draftIndex])) {
      draftTokens.push({ ...draftToken, status: 'added' });
      draftIndex += 1;
    } else if (productionToken) {
      productionTokens.push({ ...productionToken, status: 'removed' });
      productionIndex += 1;
    }
  }

  return { productionTokens, draftTokens };
}

function longestCommonSubsequenceTable(production: DiffToken[], draft: DiffToken[]): number[][] {
  const table = Array.from({ length: production.length + 1 }, () => Array.from({ length: draft.length + 1 }, () => 0));
  for (let productionIndex = production.length - 1; productionIndex >= 0; productionIndex -= 1) {
    for (let draftIndex = draft.length - 1; draftIndex >= 0; draftIndex -= 1) {
      table[productionIndex][draftIndex] =
        production[productionIndex].normalized === draft[draftIndex].normalized
          ? table[productionIndex + 1][draftIndex + 1] + 1
          : Math.max(table[productionIndex + 1][draftIndex], table[productionIndex][draftIndex + 1]);
    }
  }
  return table;
}

function collectFormulaFacts(tokens: DiffToken[]): FormulaFacts {
  const facts: FormulaFacts = {
    fields: new Set(),
    functions: new Map(),
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    if (!token.normalized.startsWith('identifier:') || next?.value !== '(') continue;
    const functionName = token.value.toUpperCase();
    facts.functions.set(functionName, (facts.functions.get(functionName) ?? 0) + 1);
    const firstArgument = tokens[index + 2];
    if (FIELD_FUNCTIONS.has(functionName) && firstArgument?.normalized.startsWith('string:')) {
      facts.fields.add(unquoteTokenValue(firstArgument.value));
    }
  }

  return facts;
}

function unquoteTokenValue(value: string): string {
  return value.replace(/^"/, '').replace(/"$/, '');
}

function changedFunctionList(productionFunctions: Map<string, number>, draftFunctions: Map<string, number>): FormulaFunctionChange[] {
  const names = Array.from(new Set([...productionFunctions.keys(), ...draftFunctions.keys()])).sort();
  return names.flatMap((name) => {
    const productionCount = productionFunctions.get(name) ?? 0;
    const draftCount = draftFunctions.get(name) ?? 0;
    if (productionCount === draftCount) return [];
    const status = productionCount === 0 ? 'added' : draftCount === 0 ? 'removed' : 'changed';
    return [{
      name,
      productionCount,
      draftCount,
      status,
      label: functionChangeLabel(name, productionCount, draftCount, status),
    }];
  });
}

function functionChangeLabel(name: string, productionCount: number, draftCount: number, status: FormulaFunctionChange['status']): string {
  if (status === 'added') return `${name} added`;
  if (status === 'removed') return `${name} removed`;
  return `${name} count changes from ${productionCount} to ${draftCount}`;
}

function sortedDifference(left: Set<string>, right: Set<string>): string[] {
  return Array.from(left).filter((value) => !right.has(value)).sort((a, b) => a.localeCompare(b));
}

function sortedIntersection(left: Set<string>, right: Set<string>): string[] {
  return Array.from(left).filter((value) => right.has(value)).sort((a, b) => a.localeCompare(b));
}

function summarizeImpact({
  hasChanges,
  tokenChangeCount,
  addedFields,
  removedFields,
  changedFunctions,
}: {
  hasChanges: boolean;
  tokenChangeCount: number;
  addedFields: string[];
  removedFields: string[];
  changedFunctions: FormulaFunctionChange[];
}): string {
  if (!hasChanges) return 'Draft matches production, so chart calculations should stay the same.';

  const sentences: string[] = [];
  if (addedFields.length && removedFields.length) {
    sentences.push(`Draft repoints the metric from ${joinList(removedFields)} to ${joinList(addedFields)}.`);
  } else if (addedFields.length) {
    sentences.push(`Draft adds ${joinList(addedFields)} to the calculation.`);
  } else if (removedFields.length) {
    sentences.push(`Draft removes ${joinList(removedFields)} from the calculation.`);
  } else {
    sentences.push(`Draft changes ${tokenChangeCount} formula token${tokenChangeCount === 1 ? '' : 's'}.`);
  }

  const functionNames = new Set(changedFunctions.map((change) => change.name));
  if (Array.from(functionNames).some((name) => FUNCTION_WITH_SIGN_IMPACT.has(name))) {
    sentences.push('Sign or absolute-value treatment may change.');
  }
  if (Array.from(functionNames).some((name) => FUNCTION_WITH_RATIO_IMPACT.has(name))) {
    sentences.push('Ratio handling or rounding may change.');
  }
  if (Array.from(functionNames).some((name) => FUNCTION_WITH_DEPENDENCY_IMPACT.has(name))) {
    sentences.push('Dependencies on other metrics may change.');
  }
  if (!changedFunctions.length && !addedFields.length && !removedFields.length) {
    sentences.push('The arithmetic changed, but source fields and function use are unchanged.');
  }

  return sentences.join(' ');
}

function joinList(items: string[]): string {
  if (items.length <= 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}
