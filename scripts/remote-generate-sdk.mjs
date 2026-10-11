import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
const producer = path.resolve(
  process.env.CODEVALANCHE_REMOTE_SOURCE || "../users-remote-service-20261011",
);
const requireProducer = createRequire(path.join(producer, "package.json"));
const { Ajv } = requireProducer("ajv"),
  formats = requireProducer("ajv-formats"),
  standalone = requireProducer("ajv/dist/standalone").default;
const inputs = [
  "src/channel/standardChannel.ts",
  "src/channel/deliveryClient.ts",
  "src/channel/sessionDescriptor.ts",
  "src/channel/packet.ts",
  "src/contracts.ts",
  "contracts/remote-control-v1.schema.json",
  "package-lock.json",
];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourceFiles = [];
for (const name of inputs)
  sourceFiles.push({
    path: name,
    sha256: sha(await readFile(path.join(producer, name))),
  });
const schema = JSON.parse(
  await readFile(path.join(producer, inputs[5]), "utf8"),
);
const ajv = new Ajv({
  strict: true,
  allErrors: false,
  code: { source: true, esm: true },
});
formats(ajv);
ajv.addSchema(schema);
const exports = {};
for (const name of ["RemoteGrant", "CommandEnvelope", "AuthorizationLease"]) {
  const id = "cv-" + name;
  ajv.addSchema({ $id: id, $ref: `${schema.$id}#/definitions/${name}` });
  exports[name] = id;
  ajv.getSchema(id);
}
const validators =
  standalone(ajv, exports) +
  `\nconst validators={RemoteGrant,CommandEnvelope,AuthorizationLease};export function validateContract(name,value){if(!validators[name]?.(value))throw Error('invalid_contract');return structuredClone(value)}\n`;
const entry = `export {createBoundQualificationChannel} from './src/channel/standardChannel.ts';export {ChannelDeliveryClient} from './src/channel/deliveryClient.ts';export {validateSessionDescriptor,packetBindingBytes,grantBindingBytes} from './src/channel/sessionDescriptor.ts';export {validateContract} from './src/contracts.ts';`;
const bundle = await build({
  stdin: {
    contents: entry,
    resolveDir: producer,
    sourcefile: "browser-sdk-entry.js",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
  plugins: [
    {
      name: "compiled-contract-validators",
      setup(b) {
        b.onLoad({ filter: /[\\/]src[\\/]contracts\.ts$/ }, () => ({
          contents: validators,
          loader: "js",
          resolveDir: producer,
        }));
      },
    },
  ],
});
const bytes = bundle.outputFiles[0].contents;
if (/\bnew Function\s*\(|\beval\s*\(/.test(bundle.outputFiles[0].text))
  throw Error("runtime_code_generation_forbidden");
for (const file of sourceFiles)
  if (sha(await readFile(path.join(producer, file.path))) !== file.sha256)
    throw Error("producer_source_changed");
const target = path.resolve("src/remote/vendor/channelSdk.js");
await writeFile(target, bytes);
await writeFile(
  path.resolve("src/remote/vendor/CHANNEL-SDK-PROVENANCE.json"),
  JSON.stringify(
    {
      productionEnabled: false,
      runEnabled: false,
      status:
        "Local qualification; physical platforms and independent review remain required",
      library: "@hpke/core 1.9.0 RFC9180 Auth P256/HKDF-SHA256/AES256GCM",
      sourceRepo: path.basename(producer),
      baseCommit: execFileSync("git", ["-C", producer, "rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      sourceFiles,
      schemaValidation:
        "AJV maintained standalone generated at build time; no runtime code compilation",
      sdkSha256: sha(bytes),
      exports: [
        "createBoundQualificationChannel",
        "ChannelDeliveryClient",
        "validateSessionDescriptor",
        "packetBindingBytes",
        "grantBindingBytes",
        "validateContract",
      ],
    },
    null,
    2,
  ) + "\n",
);
console.log("Generated strict-CSP SDK", sha(bytes));
