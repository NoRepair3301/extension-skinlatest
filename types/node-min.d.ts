// Minimal Node typings for scripts/ and tests/ (the project does not depend on @types/node).
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function writeFileSync(path: string, data: string): void;
  export function existsSync(path: string): boolean;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): { isDirectory(): boolean };
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
}
declare module "node:path" {
  export function join(...parts: string[]): string;
  export function dirname(path: string): string;
  export function relative(from: string, to: string): string;
  export function resolve(...parts: string[]): string;
  export const sep: string;
}
declare const process: {
  argv: string[];
  exitCode: number | undefined;
  env: Record<string, string | undefined>;
  cwd(): string;
  stdout: { write(text: string): void };
};
