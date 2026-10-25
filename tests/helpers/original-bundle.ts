/**
 * Pulls individual functions out of the original (minified) extension bundle
 * kept in reference/original-build, so tests can compare the rewrite with the
 * original behaviour. Relies on the fixed content of that bundle.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const bundle = readFileSync(resolve(import.meta.dirname, "../../reference/original-build/injects/index.js"), "utf8");

const PAIRS: Record<string, string> = { "{": "}", "[": "]", "(": ")" };

/** Returns the text from `start` up to and including the bracket closing the first one opened. */
function sliceBalanced(start: number): string {
  let depth = 0;
  let opened = false;
  const stack: string[] = [];
  for (let i = start; i < bundle.length; i++) {
    const char = bundle[i]!;
    if (char in PAIRS) {
      stack.push(PAIRS[char]!);
      depth++;
      opened = true;
    } else if (stack.length && char === stack[stack.length - 1]) {
      stack.pop();
      depth--;
      if (opened && depth === 0) return bundle.slice(start, i + 1);
    }
  }
  throw new Error(`Unbalanced source starting at ${start}`);
}

function indexOfUnique(marker: string): number {
  const index = bundle.indexOf(marker);
  if (index === -1 || bundle.indexOf(marker, index + 1) !== -1) throw new Error(`Marker not unique: ${marker}`);
  return index;
}

/** Source of `function name(...) {...}`. */
export function functionSource(name: string): string {
  const start = indexOfUnique(`function ${name}(`);
  // Skip the parameter list, then take the balanced body.
  const params = sliceBalanced(start + `function ${name}`.length);
  const bodyStart = start + `function ${name}`.length + params.length;
  return `function ${name}${params}${sliceBalanced(bodyStart)}`;
}

/** Source of a balanced initializer, e.g. `An=[...]` or `R=class{...}`. */
export function initializerSource(marker: string): string {
  const start = indexOfUnique(marker);
  const opener = bundle.slice(start + marker.length).search(/[[{(]/) + start + marker.length;
  return bundle.slice(start, opener) + sliceBalanced(opener);
}

/** Raw text between two unique markers (start inclusive, end exclusive). */
export function between(startMarker: string, endMarker: string): string {
  const start = indexOfUnique(startMarker);
  const end = bundle.indexOf(endMarker, start);
  return bundle.slice(start, end);
}

/** Evaluates snippets in one scope and returns the named bindings. */
export function evaluate<T>(snippets: string[], exports: string[], scope: Record<string, unknown> = {}): T {
  const body = `${snippets.join(";\n")};\nreturn { ${exports.join(", ")} };`;
  return new Function(...Object.keys(scope), body)(...Object.values(scope)) as T;
}
