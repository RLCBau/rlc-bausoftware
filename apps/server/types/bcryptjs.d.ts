declare module "bcryptjs" {
  export function hash(s: string, rounds: number): Promise<string>;
  export function compare(s: string, hash: string): Promise<boolean>;
}
