/** The parts of a worker's global scope that can reach the network. */
export interface NetworkScope {
  location: { readonly href: string; readonly origin: string };
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  XMLHttpRequest?: typeof XMLHttpRequest;
  WebSocket?: typeof WebSocket;
  importScripts?: (...urls: string[]) => void;
  navigator: {
    sendBeacon?: (url: string | URL, data?: BodyInit | null) => boolean;
  };
}

/** Why a request was refused, for the error the library that made it will log or swallow. */
function refusal(url: URL): Error {
  return new Error(
    `Blocked a request to ${url.origin}: the app only talks to itself.`,
  );
}

/**
 * Makes `scope` refuse every request that is not to its own origin (`blob:` and `data:` stay local).
 * A worker served from a static host gets no CSP of its own, and MediaPipe's task library posts usage statistics to Google
 * whenever a task closes and offers no switch to stop it; this is what keeps "no request leaves the app" true for code we do not write.
 */
export function allowOnlyOwnOrigin(scope: NetworkScope): void {
  const check = (target: string | URL | Request): void => {
    const raw = target instanceof Request ? target.url : target;
    const url = new URL(raw, scope.location.href);
    if (url.protocol === 'blob:' || url.protocol === 'data:') return;
    if (url.origin !== scope.location.origin) throw refusal(url);
  };

  const { fetch } = scope;
  // Async, so a refusal is a rejected promise, as a network failure would be.
  scope.fetch = async (input, init) => {
    check(input);
    return fetch.call(scope, input, init);
  };

  const { XMLHttpRequest: Xhr } = scope;
  if (Xhr) {
    const open = Reflect.get(Xhr.prototype, 'open') as (
      this: XMLHttpRequest,
      ...args: unknown[]
    ) => void;
    Object.defineProperty(Xhr.prototype, 'open', {
      configurable: true,
      writable: true,
      value(
        this: XMLHttpRequest,
        method: string,
        url: string | URL,
        ...rest: unknown[]
      ) {
        check(url);
        open.call(this, method, url, ...rest);
      },
    });
  }

  const { WebSocket: Socket } = scope;
  if (Socket)
    scope.WebSocket = class extends Socket {
      constructor(url: string | URL, protocols?: string | string[]) {
        check(url);
        super(url, protocols);
      }
    };

  const { importScripts } = scope;
  if (importScripts)
    scope.importScripts = (...urls) => {
      urls.forEach(check);
      importScripts.apply(scope, urls);
    };

  const { sendBeacon } = scope.navigator;
  if (sendBeacon)
    scope.navigator.sendBeacon = (url, data) => {
      check(url);
      return sendBeacon.call(scope.navigator, url, data);
    };
}
