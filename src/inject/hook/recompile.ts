const COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/gm;
const IDENTIFIERS = /([^\s,]+)/g;

function parameterNames(source: string): string[] {
  const clean = source.replace(COMMENTS, "");
  return clean.slice(clean.indexOf("(") + 1, clean.indexOf(")")).match(IDENTIFIERS) ?? [];
}

function functionBody(source: string): string {
  return source.slice(source.indexOf("{") + 1, source.lastIndexOf("}"));
}

/**
 * Turns the (patched) source of a plain `function (a, b) { ... }` back into a
 * callable. Meta module factories are self-contained, so evaluating them in
 * the global scope is equivalent. Returns undefined when the page's CSP
 * forbids evaluation, letting callers fall back to the unpatched function.
 */
export function recompileFunction(source: string): ((...args: unknown[]) => unknown) | undefined {
  try {
    return new Function(...parameterNames(source), functionBody(source)) as (...args: unknown[]) => unknown;
  } catch {
    return undefined;
  }
}
