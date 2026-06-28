/**
 * moat-relay — let a headless Chromium egress through the Moat sandbox proxy.
 *
 * Moat routes outbound traffic through an authenticating MITM proxy (`$https_proxy` =
 * http://moat:<token>@moat-proxy:19080, presenting an "O=Moat; CN=Moat CA" certificate).
 * Chromium refuses to send Basic *proxy* auth over an http proxy for HTTPS CONNECT
 * tunnels — it fails every request with `net::ERR_PROXY_AUTH_UNSUPPORTED`. curl/Node are
 * fine because they're configured with the proxy creds; the browser is not.
 *
 * The fix is a tiny localhost CONNECT relay: Chromium connects to it WITHOUT auth, and the
 * relay re-issues the CONNECT to moat-proxy WITH the `Proxy-Authorization` header, then
 * pipes the tunnel. Point the browser at the relay + `ignoreHTTPSErrors` (to accept the
 * Moat CA cert) and it reaches the real internet — verified against info.ersn.net + CARTO.
 *
 * Usage:
 *   const relay = await startMoatRelay();
 *   const ctx = await browser.newContext({ proxy: relay.proxy, ignoreHTTPSErrors: true });
 *   ...
 *   await relay.close();
 */
import net from 'node:net';
import http from 'node:http';

/** True when running inside a Moat sandbox (its env injects MOAT_* vars). */
export function inMoat() {
  return Object.keys(process.env).some((k) => k.startsWith('MOAT_'));
}

/**
 * Start the auth-injecting CONNECT relay on a random localhost port.
 * @returns {Promise<{ proxy: { server: string, bypass: string }, close: () => Promise<void> }>}
 * @throws if no proxy is configured in the environment.
 */
export async function startMoatRelay() {
  const raw = process.env.https_proxy || process.env.HTTPS_PROXY;
  if (!raw)
    throw new Error('moat-relay: no $https_proxy in the environment (not in a Moat sandbox?)');
  const u = new URL(raw);
  const up = { host: u.hostname, port: Number(u.port) };
  const auth =
    'Basic ' +
    Buffer.from(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`).toString(
      'base64'
    );

  const relay = http.createServer((_req, res) => {
    res.writeHead(405);
    res.end();
  });

  relay.on('connect', (req, client, head) => {
    const upstream = net.connect(up.port, up.host, () => {
      upstream.write(
        `CONNECT ${req.url} HTTP/1.1\r\n` +
          `Host: ${req.url}\r\n` +
          `Proxy-Authorization: ${auth}\r\n` +
          `Proxy-Connection: Keep-Alive\r\n\r\n`
      );
    });

    let established = false;
    let buf = Buffer.alloc(0);
    upstream.on('data', (d) => {
      if (established) return;
      buf = Buffer.concat([buf, d]);
      const i = buf.indexOf('\r\n\r\n');
      if (i === -1) return; // wait for the full proxy response head
      established = true;
      const ok = /^HTTP\/1\.[01] 200/.test(buf.slice(0, i).toString());
      if (!ok) {
        client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        upstream.end();
        return;
      }
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      const rest = buf.slice(i + 4);
      if (rest.length) client.write(rest); // bytes the upstream sent past the head
      if (head?.length) upstream.write(head); // bytes the client sent past its CONNECT
      upstream.pipe(client);
      client.pipe(upstream);
    });

    upstream.on('error', () => client.destroy());
    client.on('error', () => upstream.destroy());
  });

  await new Promise((resolve) => relay.listen(0, '127.0.0.1', resolve));
  const { port } = relay.address();

  return {
    proxy: { server: `http://127.0.0.1:${port}`, bypass: 'localhost,127.0.0.1' },
    close: () => new Promise((resolve) => relay.close(resolve)),
  };
}
