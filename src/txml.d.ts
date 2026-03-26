declare module 'txml' {
  export interface tNode {
    tagName: string;
    attributes: Record<string, string>;
    children: (tNode | string)[];
  }

  export interface TParseOptions {
    pos?: number;
    noChildNodes?: string[];
    setPos?: boolean;
    keepComments?: boolean;
    keepWhitespace?: boolean;
    simplify?: boolean;
    filter?: (a: tNode, b: tNode) => boolean;
  }

  export function parse(S: string, options?: TParseOptions): (tNode | string)[];
  export function stringify(O: tNode): string;
  export function simplify(children: tNode[]): Record<string, unknown>;
  export function toContentString(tDom: unknown): string;
}
