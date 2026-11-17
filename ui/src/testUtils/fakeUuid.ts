/** A readable, predictable id in the shape `crypto.randomUUID` returns, so mocks of it need no cast. */
export const fakeUuid = (n: number): ReturnType<typeof crypto.randomUUID> =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
