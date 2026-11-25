// @effect-diagnostics globalFetch:off globalTimers:off globalDate:off -- Plain Node downloader in the Electron main process, outside Effect.
// @effect-diagnostics nodeBuiltinImport:off -- Writes model files and unpacks llama-server.

import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";
import * as NodeStream from "node:stream";
import * as NodeStreamPromises from "node:stream/promises";

import type { DesktopVoiceSetupStatus } from "@t3tools/contracts";

/** One file of the starter pack, pinned to the exact revision and checksum the fork tests with. */
export interface VoiceSetupDownload {
  readonly url: string;
  /** Where it lands, relative to the models directory. */
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
  /** An archive is unpacked into this directory (relative to the models directory) and removed. */
  readonly unpackTo?: string;
  /** Archives that wrap their files in one top-level folder. */
  readonly stripFolder?: boolean;
}

const hf = (repo: string, revision: string, file: string) =>
  `https://huggingface.co/${repo}/resolve/${revision}/${file}`;
const PARAKEET = [
  "csukuangfj2/sherpa-onnx-nemo-parakeet-unified-en-0.6b-int8-non-streaming",
  "8c3a10fb13408c7a7054f6898958bf1c64a8d6c7",
] as const;
const PHONON = ["gradium/phonon-31m-en", "8f7a37c94a4c58b04c8287300c53f11d2e208eae"] as const;
const VOICES = ["gradium/phonon-voices", "0ee17205f254b5abc43b266c8a0f215565c352f7"] as const;
const GEMMA = [
  "google/gemma-4-E4B-it-qat-q4_0-gguf",
  "4b4a2c1d584be7264f87aac328a1bc739ce81b6c",
] as const;
const DRAFT = [
  "unsloth/gemma-4-E4B-it-qat-GGUF",
  "8c5a9e4fd5482e2be20fe0bf013b4c262a8f4265",
] as const;
const LLAMA_BUILD = "b9763";

// Phonon's config as the speech helper reads it: Hugging Face's config holds these and more.
export const PHONON_CONFIG_KEYS = [
  "audio_prompt_min_duration",
  "conditioners",
  "embeddings_ext",
  "eos_threshold",
  "flow_lm",
  "fuser",
  "languages",
  "lsd_decode_steps",
  "mimi",
  "model_id",
  "speaker_mimi",
  "temp",
  "tokenizer_name",
  "weights_name",
] as const;
const PHONON_CONFIG_URL = hf(...PHONON, "config.json");

const LLAMA_ARCHIVES: Partial<Record<string, Omit<VoiceSetupDownload, "path" | "unpackTo">>> = {
  "win32-x64": {
    url: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_BUILD}/llama-${LLAMA_BUILD}-bin-win-vulkan-x64.zip`,
    size: 38_939_043,
    sha256: "c18ea8960d1806b0ca8d21ee357a553eee24235965b25828ad953a3be61c2404",
  },
  "linux-x64": {
    url: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_BUILD}/llama-${LLAMA_BUILD}-bin-ubuntu-vulkan-x64.tar.gz`,
    size: 38_540_299,
    sha256: "8acb16432e1eee95e15540ffaa57a7107d7994156b2a6a8a85f015e8417e7218",
    stripFolder: true,
  },
  "darwin-arm64": {
    url: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_BUILD}/llama-${LLAMA_BUILD}-bin-macos-arm64.tar.gz`,
    size: 10_978_734,
    sha256: "7706d1a7630218a3665d8c2d680bb54ab7f101896e9c45caaf5676ef4ce2e2d0",
    stripFolder: true,
  },
  "darwin-x64": {
    url: `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_BUILD}/llama-${LLAMA_BUILD}-bin-macos-x64.tar.gz`,
    size: 11_280_969,
    sha256: "8ce3ef62326d1359958352e56c4926d57ef4345b87b44b16fba263a4f66ef4e3",
    stripFolder: true,
  },
};

/** The starter pack for this machine, laid out where `voiceModels.ts` looks by default. */
function voiceSetupDownloads(platform: NodeJS.Platform, arch: string): VoiceSetupDownload[] {
  const parakeet = (file: string, size: number, sha256: string): VoiceSetupDownload => ({
    url: hf(...PARAKEET, file),
    path: `parakeet-unified-en-0.6b/${file}`,
    size,
    sha256,
  });
  const downloads: VoiceSetupDownload[] = [
    parakeet(
      "encoder.int8.onnx",
      654_040_552,
      "6716910b7a0833997fec7a410494c995d70124001a0e9b66d6370d6aced577e0",
    ),
    parakeet(
      "decoder.int8.onnx",
      7_257_753,
      "a5e223392c90e75f8144cdb5eb95af7625db389e39edef2bd1a9c872b3298fe6",
    ),
    parakeet(
      "joiner.int8.onnx",
      1_735_860,
      "869f43f7d24595c55581ad3bf249a935fb8a71389fbdaa7504b9f46f93140f8a",
    ),
    parakeet(
      "tokens.txt",
      8_952,
      "dc0b4584ab2e4ddbf888425c076c61b736e7356a015250db7d307e6f1a8188ff",
    ),
    {
      url: hf(...PHONON, "model.safetensors"),
      path: "phonon-31m-en-maeve/model.safetensors",
      size: 102_823_920,
      sha256: "8a04cf833cfe69b67c2ec968b2d31244655b9accc84ade9c0ebcc176f2074607",
    },
    {
      url: hf(...PHONON, "tokenizer.json"),
      path: "phonon-31m-en-maeve/tokenizer.json",
      size: 277_967,
      sha256: "691a00068fa7b989f2f3e5ae5daa2d1a5bb319f2d5360deafcfb19a8bb6e7936",
    },
    {
      url: hf(...VOICES, "voices/6PWnV0Nq4wu7RVBT.safetensors"),
      path: "phonon-31m-en-maeve/voices/Maeve.safetensors",
      size: 256_136,
      sha256: "56494ee67d533ad227ff0dfd0b1c13ff5aa91f1ad6e596e66c2986ba3005e844",
    },
    {
      url: hf(...GEMMA, "gemma-4-E4B_q4_0-it.gguf"),
      path: "gemma-4-E4B_q4_0-it.gguf",
      size: 5_154_941_280,
      sha256: "676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee",
    },
    {
      url: hf(...DRAFT, "mtp-gemma-4-E4B-it.gguf"),
      path: "mtp-gemma-4-E4B-it.gguf",
      size: 59_678_016,
      sha256: "423074e537504b4f9ec5eafed5c639fac82c96631626efccacdd3c4039b20605",
    },
  ];
  const llama = LLAMA_ARCHIVES[`${platform}-${arch}`];
  if (llama) {
    const ext = llama.url.endsWith(".zip") ? "zip" : "tar.gz";
    downloads.push({ ...llama, path: `llama-${LLAMA_BUILD}.${ext}`, unpackTo: "llama" });
  }
  return downloads;
}

async function sha256Of(file: string): Promise<string> {
  const hash = NodeCrypto.createHash("sha256");
  await NodeStreamPromises.pipeline(NodeFS.createReadStream(file), hash);
  return hash.digest("hex");
}

/**
 * Downloads one file into place, resuming a `.part` left by an earlier attempt, and keeps it only
 * when its size and checksum match. `onBytes` reports bytes received in this call.
 */
export async function downloadVerified(
  download: Pick<VoiceSetupDownload, "url" | "size" | "sha256">,
  destination: string,
  signal: AbortSignal,
  onBytes: (bytes: number) => void,
): Promise<void> {
  const part = `${destination}.part`;
  NodeFS.mkdirSync(NodePath.dirname(destination), { recursive: true });
  let have = NodeFS.existsSync(part) ? NodeFS.statSync(part).size : 0;
  if (have > download.size) {
    NodeFS.rmSync(part);
    have = 0;
  }
  if (have > 0) onBytes(have);
  if (have < download.size) {
    const response = await fetch(download.url, {
      signal,
      headers: have > 0 ? { Range: `bytes=${have}-` } : {},
    });
    if (!response.ok || !response.body) {
      throw new Error(`Download failed (${response.status}) for ${download.url}`);
    }
    // A server that ignores the range sends the whole file: start the part over.
    const append = have > 0 && response.status === 206;
    if (have > 0 && !append) onBytes(-have);
    const body = NodeStream.Readable.fromWeb(
      response.body as import("node:stream/web").ReadableStream,
    );
    body.on("data", (chunk: Buffer) => onBytes(chunk.length));
    await NodeStreamPromises.pipeline(
      body,
      NodeFS.createWriteStream(part, { flags: append ? "a" : "w" }),
      { signal },
    );
  }
  const size = NodeFS.statSync(part).size;
  const sha256 = size === download.size ? await sha256Of(part) : "";
  if (sha256 !== download.sha256) {
    NodeFS.rmSync(part, { force: true });
    throw new Error(`The download of ${NodePath.basename(destination)} was damaged. Try again.`);
  }
  NodeFS.renameSync(part, destination);
}

// Windows' own bsdtar unpacks zip; Git for Windows puts a GNU tar earlier on PATH that cannot.
const tarCommand = (platform: NodeJS.Platform, systemRoot: string | undefined) =>
  platform === "win32" ? NodePath.join(systemRoot ?? "C:/Windows", "System32", "tar.exe") : "tar";

function unpack(
  archive: string,
  directory: string,
  stripFolder: boolean,
  tar: string,
): Promise<void> {
  NodeFS.mkdirSync(directory, { recursive: true });
  // bsdtar on Windows 10+ and macOS unpacks zip and tar.gz alike; GNU tar on Linux only gets tar.gz.
  const args = ["-xf", archive, "-C", directory, ...(stripFolder ? ["--strip-components=1"] : [])];
  return new Promise((resolve, reject) => {
    NodeChildProcess.execFile(tar, args, { windowsHide: true }, (error) =>
      error ? reject(new Error(`Could not unpack llama-server: ${error.message}`)) : resolve(),
    );
  });
}

/** Writes Phonon's config with only the keys the speech helper reads. */
export function phononConfig(huggingFaceConfig: Record<string, unknown>): string {
  const missing = PHONON_CONFIG_KEYS.filter((key) => !(key in huggingFaceConfig));
  if (missing.length > 0) throw new Error(`Phonon's config is missing ${missing.join(", ")}.`);
  return JSON.stringify(
    Object.fromEntries(PHONON_CONFIG_KEYS.map((key) => [key, huggingFaceConfig[key]])),
    null,
    2,
  );
}

interface VoiceSetupOptions {
  readonly modelsDirectory: string;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly onStatus: (status: DesktopVoiceSetupStatus) => void;
  readonly onInstalled: () => void;
  readonly log: (message: string, detail?: Record<string, unknown>) => void;
}

/** Downloads the starter pack into `modelsDirectory`, reporting progress as it goes. */
export class VoiceSetup {
  private status: DesktopVoiceSetupStatus;
  private abort: AbortController | undefined;
  private readonly downloads: VoiceSetupDownload[];

  private readonly options: VoiceSetupOptions;

  constructor(options: VoiceSetupOptions) {
    this.options = options;
    this.downloads = voiceSetupDownloads(options.platform, options.arch);
    this.status = { phase: "missing", receivedBytes: 0, totalBytes: this.totalBytes() };
  }

  current(): DesktopVoiceSetupStatus {
    return this.status;
  }

  private totalBytes() {
    return this.downloads.reduce((total, download) => total + download.size, 0);
  }

  private set(status: DesktopVoiceSetupStatus) {
    this.status = status;
    this.options.onStatus(status);
  }

  cancel() {
    this.abort?.abort();
  }

  async start(): Promise<void> {
    if (this.abort) return;
    const abort = new AbortController();
    this.abort = abort;
    const totalBytes = this.totalBytes();
    let receivedBytes = 0;
    let lastReport = 0;
    const report = (force = false) => {
      const now = Date.now();
      if (!force && now - lastReport < 250) return;
      lastReport = now;
      this.set({ phase: "downloading", receivedBytes, totalBytes });
    };
    const started = Date.now();
    this.options.log("voice setup started", { totalBytes });
    try {
      report(true);
      for (const download of this.downloads) {
        const destination = NodePath.join(this.options.modelsDirectory, download.path);
        const installed = download.unpackTo
          ? NodeFS.existsSync(NodePath.join(this.options.modelsDirectory, download.unpackTo))
          : NodeFS.existsSync(destination) && NodeFS.statSync(destination).size === download.size;
        if (installed) {
          receivedBytes += download.size;
          continue;
        }
        await downloadVerified(download, destination, abort.signal, (bytes) => {
          receivedBytes += bytes;
          report();
        });
        if (download.unpackTo) {
          this.set({ phase: "installing", receivedBytes, totalBytes });
          const directory = NodePath.join(this.options.modelsDirectory, download.unpackTo);
          const staging = `${directory}.part`;
          NodeFS.rmSync(staging, { recursive: true, force: true });
          await unpack(
            destination,
            staging,
            Boolean(download.stripFolder),
            tarCommand(this.options.platform, NodeProcess.env.SystemRoot),
          );
          NodeFS.renameSync(staging, directory);
          NodeFS.rmSync(destination, { force: true });
        }
      }
      const configPath = NodePath.join(
        this.options.modelsDirectory,
        "phonon-31m-en-maeve",
        "config.json",
      );
      if (!NodeFS.existsSync(configPath)) {
        const response = await fetch(PHONON_CONFIG_URL, { signal: abort.signal });
        if (!response.ok)
          throw new Error(`Download failed (${response.status}) for Phonon's config`);
        NodeFS.writeFileSync(
          configPath,
          phononConfig((await response.json()) as Record<string, unknown>),
        );
      }
      this.options.log("voice setup finished", {
        seconds: Math.round((Date.now() - started) / 1000),
      });
      this.abort = undefined;
      this.options.onInstalled();
    } catch (error) {
      this.abort = undefined;
      const cancelled = abort.signal.aborted;
      this.options.log(cancelled ? "voice setup cancelled" : "voice setup failed", {
        error: (error as Error).message,
      });
      this.set(
        cancelled
          ? { phase: "missing", receivedBytes: 0, totalBytes }
          : { phase: "failed", receivedBytes, totalBytes, error: (error as Error).message },
      );
    }
  }
}
