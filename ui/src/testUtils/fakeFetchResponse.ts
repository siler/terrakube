type Chunk = Uint8Array<ArrayBuffer>;

type FakeResponseInit = { status?: number; chunks?: string[] };

const unsupported = (): never => {
  throw new Error("Not supported by the fake");
};

/** A readable stream of `chunks`, read one per `read()`; jsdom has no global ReadableStream. */
class FakeByteStream implements ReadableStream<Chunk> {
  readonly locked = false;
  private readonly chunks: Chunk[];

  constructor(chunks: string[]) {
    const encoder = new TextEncoder();
    this.chunks = chunks.map((chunk) => encoder.encode(chunk));
  }

  getReader(options: { mode: "byob" }): ReadableStreamBYOBReader;
  getReader(): ReadableStreamDefaultReader<Chunk>;
  getReader(options?: ReadableStreamGetReaderOptions): ReadableStreamReader<Chunk>;
  getReader(options?: ReadableStreamGetReaderOptions): ReadableStreamReader<Chunk> {
    if (options?.mode === "byob") {
      return unsupported();
    }
    const pending = [...this.chunks];
    const reader: ReadableStreamDefaultReader<Chunk> = {
      closed: Promise.resolve(),
      cancel: () => Promise.resolve(),
      releaseLock: () => {},
      read: async (): Promise<ReadableStreamReadResult<Chunk>> => {
        const value = pending.shift();
        return value == null ? { done: true, value: undefined } : { done: false, value };
      },
    };
    return reader;
  }

  cancel = (): Promise<void> => Promise.resolve();
  pipeThrough = unsupported;
  pipeTo = unsupported;
  tee = unsupported;
  values = unsupported;
  [Symbol.asyncIterator] = unsupported;
}

/** A fetch `Response` for jsdom tests, which have no global Response; `chunks` become its streamed body. */
export class FakeResponse implements Response {
  readonly body: ReadableStream<Chunk> | null;
  readonly bodyUsed = false;
  readonly headers = new Headers();
  readonly ok: boolean;
  readonly redirected = false;
  readonly status: number;
  readonly statusText = "";
  readonly type: ResponseType = "basic";
  readonly url = "";

  constructor({ status = 200, chunks }: FakeResponseInit = {}) {
    this.status = status;
    this.ok = status >= 200 && status < 300;
    this.body = chunks == null ? null : new FakeByteStream(chunks);
  }

  arrayBuffer = unsupported;
  blob = unsupported;
  bytes = unsupported;
  formData = unsupported;
  json = unsupported;
  text = unsupported;
  clone = unsupported;
}
