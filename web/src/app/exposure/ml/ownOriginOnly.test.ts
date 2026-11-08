import { describe, expect, it, vi } from 'vitest';

import { allowOnlyOwnOrigin, type NetworkScope } from './ownOriginOnly';

const ORIGIN = 'https://owner.github.io';
const HREF = `${ORIGIN}/ExposureBuddy/_next/static/chunks/worker.js`;

function setup() {
  const fetchSpy = vi.fn<NetworkScope['fetch']>(async () => new Response('ok'));
  const importScriptsSpy = vi.fn<NonNullable<NetworkScope['importScripts']>>();
  const sendBeaconSpy = vi.fn<
    NonNullable<NetworkScope['navigator']['sendBeacon']>
  >(() => true);
  const opened: string[] = [];
  class FakeXhr {
    open(_method: string, url: string | URL) {
      opened.push(String(url));
    }
  }
  const sockets: string[] = [];
  class FakeSocket {
    constructor(url: string | URL) {
      sockets.push(String(url));
    }
  }
  const scope = {
    location: { href: HREF, origin: ORIGIN },
    fetch: fetchSpy,
    XMLHttpRequest: FakeXhr as unknown as NetworkScope['XMLHttpRequest'],
    WebSocket: FakeSocket as unknown as NetworkScope['WebSocket'],
    importScripts: importScriptsSpy,
    navigator: { sendBeacon: sendBeaconSpy },
  } satisfies NetworkScope;
  allowOnlyOwnOrigin(scope);
  return {
    scope,
    fetchSpy,
    importScriptsSpy,
    sendBeaconSpy,
    opened,
    sockets,
    FakeXhr,
  };
}

describe('allowOnlyOwnOrigin: fetch', () => {
  it('passes a request to the app itself through, absolute or relative', async () => {
    const { scope, fetchSpy } = setup();
    await scope.fetch(`${ORIGIN}/ExposureBuddy/ml/deeplab_v3.tflite`);
    await scope.fetch('../ml/model.bin', { method: 'GET' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenLastCalledWith('../ml/model.bin', {
      method: 'GET',
    });
  });

  it('refuses a request to another origin, and names it, without sending it', async () => {
    const { scope, fetchSpy } = setup();
    await expect(
      scope.fetch('https://odml.pa.googleapis.com/v1/log', {
        method: 'POST',
        body: 'stats',
      }),
    ).rejects.toThrow('Blocked a request to https://odml.pa.googleapis.com');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses another origin given as a URL object or a Request', async () => {
    const { scope, fetchSpy } = setup();
    await expect(
      scope.fetch(new URL('https://cdn.example/a.wasm')),
    ).rejects.toThrow('cdn.example');
    await expect(
      scope.fetch(new Request('https://cdn.example/b')),
    ).rejects.toThrow('cdn.example');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses the same host on another port or scheme', async () => {
    const { scope } = setup();
    await expect(scope.fetch('http://owner.github.io/x')).rejects.toThrow(
      'Blocked',
    );
    await expect(scope.fetch('https://owner.github.io:8443/x')).rejects.toThrow(
      'Blocked',
    );
    await expect(
      scope.fetch('https://owner.github.io.evil.example/x'),
    ).rejects.toThrow('Blocked');
  });

  it('lets blob: and data: through: they never leave the device', async () => {
    const { scope, fetchSpy } = setup();
    await scope.fetch('blob:https://owner.github.io/1234');
    await scope.fetch('data:text/plain,hi');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe('allowOnlyOwnOrigin: the other ways out', () => {
  it('refuses an XMLHttpRequest to another origin and allows its own', () => {
    const { scope, opened } = setup();
    const xhr = new (scope.XMLHttpRequest as new () => XMLHttpRequest)();
    xhr.open('GET', '/ExposureBuddy/ml/a');
    expect(() => xhr.open('POST', 'https://tracker.example/log')).toThrow(
      'tracker.example',
    );
    expect(opened).toEqual(['/ExposureBuddy/ml/a']);
  });

  it('refuses a WebSocket to another origin and allows its own', () => {
    const { scope, sockets } = setup();
    const Socket = scope.WebSocket as new (url: string) => WebSocket;
    new Socket(`${ORIGIN}/live`);
    expect(() => new Socket('wss://tracker.example/live')).toThrow(
      'tracker.example',
    );
    expect(sockets).toEqual([`${ORIGIN}/live`]);
  });

  it('refuses importScripts of another origin, even among our own, and loads none of them', () => {
    const { scope, importScriptsSpy } = setup();
    scope.importScripts?.('/ExposureBuddy/ml/vision_wasm_internal.js');
    expect(importScriptsSpy).toHaveBeenCalledTimes(1);
    expect(() =>
      scope.importScripts?.('/a.js', 'https://cdn.example/b.js'),
    ).toThrow('cdn.example');
    expect(importScriptsSpy).toHaveBeenCalledTimes(1);
  });

  it('refuses a beacon to another origin and passes its own on, with the data', () => {
    const { scope, sendBeaconSpy } = setup();
    expect(scope.navigator.sendBeacon?.('/ExposureBuddy/ping', 'x')).toBe(true);
    expect(sendBeaconSpy).toHaveBeenCalledWith('/ExposureBuddy/ping', 'x');
    expect(() =>
      scope.navigator.sendBeacon?.('https://tracker.example/b', 'x'),
    ).toThrow('tracker.example');
  });

  it('copes with a scope that lacks some of them', () => {
    const scope: NetworkScope = {
      location: { href: HREF, origin: ORIGIN },
      fetch: vi.fn(async () => new Response('ok')),
      navigator: {},
    };
    expect(() => allowOnlyOwnOrigin(scope)).not.toThrow();
    expect(scope.XMLHttpRequest).toBeUndefined();
    expect(scope.navigator.sendBeacon).toBeUndefined();
  });
});
