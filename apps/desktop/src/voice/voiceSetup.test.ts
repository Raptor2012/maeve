// @effect-diagnostics nodeBuiltinImport:off -- Exercises real downloads against a local HTTP server.
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeHttp from "node:http";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";

import { downloadVerified, phononConfig, PHONON_CONFIG_KEYS } from "./voiceSetup.ts";

const content = Buffer.from("local voice starter pack ".repeat(400));
const sha256 = NodeCrypto.createHash("sha256").update(content).digest("hex");

async function serve(honourRange: boolean) {
  const ranges: Array<string | undefined> = [];
  const server = NodeHttp.createServer((request, response) => {
    ranges.push(request.headers.range);
    const match = honourRange ? /^bytes=(\d+)-$/.exec(request.headers.range ?? "") : null;
    if (match) {
      response.writeHead(206);
      response.end(content.subarray(Number(match[1])));
    } else {
      response.writeHead(200);
      response.end(content);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}/model.bin`,
    ranges,
    [Symbol.asyncDispose]: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function scratch() {
  const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "voice-setup-"));
  return { dir, [Symbol.dispose]: () => NodeFS.rmSync(dir, { recursive: true, force: true }) };
}

describe("downloadVerified", () => {
  it("resumes a partial download and counts every byte once", async () => {
    await using server = await serve(true);
    using tmp = scratch();
    const destination = NodePath.join(tmp.dir, "model.bin");
    NodeFS.writeFileSync(`${destination}.part`, content.subarray(0, 1000));
    let received = 0;
    await downloadVerified(
      { url: server.url, size: content.length, sha256 },
      destination,
      new AbortController().signal,
      (bytes) => (received += bytes),
    );
    expect(server.ranges).toEqual(["bytes=1000-"]);
    expect(NodeFS.readFileSync(destination).equals(content)).toBe(true);
    expect(NodeFS.existsSync(`${destination}.part`)).toBe(false);
    expect(received).toBe(content.length);
  });

  it("starts over when the server ignores the resume request", async () => {
    await using server = await serve(false);
    using tmp = scratch();
    const destination = NodePath.join(tmp.dir, "model.bin");
    NodeFS.writeFileSync(`${destination}.part`, content.subarray(0, 1000));
    let received = 0;
    await downloadVerified(
      { url: server.url, size: content.length, sha256 },
      destination,
      new AbortController().signal,
      (bytes) => (received += bytes),
    );
    expect(NodeFS.readFileSync(destination).equals(content)).toBe(true);
    expect(received).toBe(content.length);
  });

  it("keeps nothing when the checksum does not match", async () => {
    await using server = await serve(true);
    using tmp = scratch();
    const destination = NodePath.join(tmp.dir, "model.bin");
    await expect(
      downloadVerified(
        { url: server.url, size: content.length, sha256: "0".repeat(64) },
        destination,
        new AbortController().signal,
        () => undefined,
      ),
    ).rejects.toThrow(/damaged/);
    expect(NodeFS.existsSync(destination)).toBe(false);
    expect(NodeFS.existsSync(`${destination}.part`)).toBe(false);
  });
});

describe("phononConfig", () => {
  it("keeps only the keys the speech helper reads", () => {
    const full = Object.fromEntries(
      [...PHONON_CONFIG_KEYS, "architectures"].map((key) => [key, 1]),
    );
    expect(Object.keys(JSON.parse(phononConfig(full)))).toEqual([...PHONON_CONFIG_KEYS]);
    expect(() => phononConfig({ flow_lm: {} })).toThrow(/missing/);
  });
});
