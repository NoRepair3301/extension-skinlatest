// Minimal jsdom typings (the project does not depend on @types/jsdom).
declare module "jsdom" {
  export class JSDOM {
    constructor(html?: string);
    window: Window & typeof globalThis;
    serialize(): string;
  }
}
