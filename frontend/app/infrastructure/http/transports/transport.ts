export interface RawHttpTransport {
  send(path: string, init?: RequestInit): Promise<Response>;
}

export function browserTransport(): RawHttpTransport {
  return {
    send(path, init) {
      return fetch(path, { ...init, credentials: "same-origin" });
    },
  };
}

export function serverTransport(input: {
  origin: string;
  cookie: string | undefined;
  acceptLanguage: string | undefined;
  requestId: string | undefined;
  onSetCookie: (value: string) => void;
}): RawHttpTransport {
  return {
    async send(path, init) {
      const headers = new Headers(init?.headers);
      if (input.cookie) headers.set("cookie", input.cookie);
      if (input.acceptLanguage)
        headers.set("accept-language", input.acceptLanguage);
      if (input.requestId) headers.set("x-request-id", input.requestId);
      const response = await fetch(new URL(path, input.origin), {
        ...init,
        headers,
        redirect: "manual",
      });
      const responseHeaders = response.headers as Headers & {
        getSetCookie?: () => string[];
      };
      const cookies =
        responseHeaders.getSetCookie?.() ??
        (response.headers.get("set-cookie")
          ? [response.headers.get("set-cookie") as string]
          : []);
      for (const cookie of cookies) input.onSetCookie(cookie);
      return response;
    },
  };
}
