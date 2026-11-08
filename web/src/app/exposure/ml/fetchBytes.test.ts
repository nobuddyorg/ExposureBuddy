import { describe, expect, it } from 'vitest';

import { combineProgress, fetchBytes } from './fetchBytes';

function respond(
  chunks: number[][],
  headers: Record<string, string> = {},
  status = 200,
): typeof fetch {
  return async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks)
            controller.enqueue(Uint8Array.from(chunk));
          controller.close();
        },
      }),
      { status, headers },
    );
}

describe('fetchBytes', () => {
  it('returns every byte in order and reports progress after each chunk', async () => {
    const seen: [number, number][] = [];
    const bytes = await fetchBytes(
      '/model',
      (loaded, total) => seen.push([loaded, total]),
      respond([[1, 2], [3], [4, 5, 6]], { 'content-length': '6' }),
    );
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(seen).toEqual([
      [0, 6],
      [2, 6],
      [3, 6],
      [6, 6],
    ]);
  });

  it('reports a total of 0 when the server does not say how big the file is', async () => {
    const seen: [number, number][] = [];
    await fetchBytes(
      '/model',
      (loaded, total) => seen.push([loaded, total]),
      respond([[9]]),
    );
    expect(seen).toEqual([
      [0, 0],
      [1, 0],
    ]);
  });

  it('reads a response that has no stream', async () => {
    const seen: [number, number][] = [];
    const bodyless = async () =>
      ({
        ok: true,
        headers: new Headers({ 'content-length': '3' }),
        body: null,
        arrayBuffer: async () => Uint8Array.from([7, 8, 9]).buffer,
      }) as unknown as Response;
    const bytes = await fetchBytes(
      '/model',
      (loaded, total) => seen.push([loaded, total]),
      bodyless,
    );
    expect(Array.from(bytes)).toEqual([7, 8, 9]);
    expect(seen).toEqual([
      [0, 3],
      [3, 3],
    ]);
  });

  it('names the address and the status when the server refuses', async () => {
    await expect(
      fetchBytes('/ml/model.bin', () => {}, respond([], {}, 404)),
    ).rejects.toThrow('/ml/model.bin answered 404.');
  });

  it('fetches the address it was given', async () => {
    const asked: string[] = [];
    await fetchBytes(
      '/ml/a.wasm',
      () => {},
      async (input) => {
        asked.push(input as string);
        return new Response(new Uint8Array(0));
      },
    );
    expect(asked).toEqual(['/ml/a.wasm']);
  });
});

describe('combineProgress', () => {
  it('adds up downloads that run side by side', () => {
    const seen: [number, number][] = [];
    const of = combineProgress(2, (loaded, total) =>
      seen.push([loaded, total]),
    );
    of(0)(10, 100);
    of(1)(5, 50);
    of(0)(100, 100);
    expect(seen).toEqual([
      [10, 100],
      [15, 150],
      [105, 150],
    ]);
  });

  it('counts a download that has not reported yet as nothing, whatever order they report in', () => {
    const seen: [number, number][] = [];
    const of = combineProgress(3, (loaded, total) =>
      seen.push([loaded, total]),
    );
    of(2)(7, 70);
    of(0)(1, 10);
    expect(seen).toEqual([
      [7, 70],
      [8, 80],
    ]);
  });

  it('never reports more loaded than the total, which compression can cause', () => {
    const seen: [number, number][] = [];
    combineProgress(1, (loaded, total) => seen.push([loaded, total]))(0)(
      120,
      100,
    );
    expect(seen).toEqual([[100, 100]]);
  });
});
