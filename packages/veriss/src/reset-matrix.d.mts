import type {LayoutOptions} from './layout-contracts.d.ts';
/** A platform-agnostic UA profile (a value Linux and macOS disagree on is not known). */
export type BrowserUA = 'chromium' | 'firefox' | 'webkit';
/** Any UA profile id: the platform-agnostic three, or one platform's measured values. */
export type MatrixUA = BrowserUA | 'firefox-linux' | 'firefox-macos' | 'webkit-linux' | 'webkit-macos';
/** One vendored reset stylesheet (src/resets/manifest.json). css is the exact text a browser receives; '' for none. */
export interface ResetEntry {
  id: string; name: string; version: string | null; license: string | null; url: string | null;
  package?: string | null; file: string | null; licenseFile?: string; source?: string; sha256: string | null; css: string;
}
export const resets: readonly ResetEntry[];
export function resetById(id: string): ResetEntry;
/** The UAs of the default space: chromium, firefox, webkit. */
export const uas: readonly BrowserUA[];
/** Every UA profile id a branch can name. */
export const allUAs: readonly MatrixUA[];
export interface Branch { id: string; ua: MatrixUA; reset: string }
export function enumerateBranches(space?: {uas?: readonly MatrixUA[]; resets?: readonly string[]}): Branch[];
export function sampleBranches(branches: readonly Branch[], options: {sample: number; seed?: number}): Branch[];
export type BranchSetPart = {uas: readonly string[] | 'any'; resets: readonly string[] | 'any'};
export function describeBranchSet(ids: readonly string[], space: {uas: readonly string[]; resets: readonly string[]}): {where: BranchSetPart | BranchSetPart[]; summary: string};
export interface MatrixFinding {
  code: string; severity: string; box?: string; path?: string; property?: unknown;
  /** Branch ids it is found in, and its message in each. */
  in: string[]; messages: Record<string, string>;
  /** Decided branches it is not found in, and Unknown branches (its absence there is not shown). */
  absent: string[]; undecided: string[];
  where: BranchSetPart | BranchSetPart[]; summary: string;
}
export function compareBranches<F>(branches: readonly {id: string; ua: string; reset: string; status: string; findings: readonly F[]}[], options?: {space?: {uas: readonly string[]; resets: readonly string[]}; keyOf?: (finding: F) => string; fields?: (finding: F) => object; message?: (finding: F) => string}): {holdsEverywhere: MatrixFinding[]; onlyIn: MatrixFinding[]};
export interface ResetMatrix {
  status: 'verified' | 'violated' | 'unknown';
  branches: (Branch & {status: 'verified' | 'violated' | 'unknown'; findings: any[]; resetFindings: any[]; unknowns: any[]; report: any})[];
  holdsEverywhere: MatrixFinding[];
  onlyIn: MatrixFinding[];
  /** Findings located in a reset stylesheet itself, per reset. */
  resetFindings: Record<string, any[]>;
  unknowns: Record<string, any[]>;
  equivalent: {members: string[]; basis: 'identical results'}[];
  space: {uas: MatrixUA[]; resets: string[]; total: number; analyzed: number; sampled?: {sample: number; seed: number}};
}
export function analyzeResetMatrix(
  input: {html: string; css?: string} | {tree: unknown; css?: string} | Record<string, never>,
  options?: Partial<Omit<LayoutOptions, 'ua'>> & {css?: string; uas?: readonly MatrixUA[]; resets?: readonly string[]; sample?: number; seed?: number; analyze?: (options: any) => any; name?: string},
): ResetMatrix;
