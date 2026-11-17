import "csstype";

declare module "csstype" {
  // Lets inline styles set CSS custom properties, which the components use to feed per-item colours and sizes to CSS.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- a merged declaration must repeat csstype's type parameters
  interface Properties<TLength = (string & {}) | 0, TTime = string & {}> {
    [variable: `--${string}`]: string | number | undefined;
  }
}
