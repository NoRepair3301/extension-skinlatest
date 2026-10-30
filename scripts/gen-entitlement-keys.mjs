// Generates the Ed25519 key pair for Plus entitlement tokens (docs/BACKEND_SETUP.md, step 5).
// The private key is written only to private/ (gitignored) and is never printed. Only the public key is printed.
// Usage: node scripts/gen-entitlement-keys.mjs [--force]
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const OUT = "private/backend.secrets.env";
const force = process.argv.includes("--force");

if (!readFileSync(".gitignore", "utf8").split(/\r?\n/).includes("private/")) {
  console.error("Refusing: private/ is not in .gitignore.");
  process.exit(1);
}
if (existsSync(OUT) && !force) {
  const has = readFileSync(OUT, "utf8").includes("ENTITLEMENT_PRIVATE_KEY=");
  if (has) {
    console.error(`${OUT} already has a signing key. Re-run with --force to replace it (existing tokens then stop verifying).`);
    process.exit(1);
  }
}

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const pub = publicKey.export({ format: "der", type: "spki" }).toString("base64");
const priv = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");

mkdirSync("private", { recursive: true });
const keep = existsSync(OUT)
  ? readFileSync(OUT, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.trim() !== "" && !l.startsWith("ENTITLEMENT_PRIVATE_KEY=") && !l.startsWith("ENTITLEMENT_PUBLIC_KEY="))
  : [];
writeFileSync(OUT, [...keep, `ENTITLEMENT_PRIVATE_KEY=${priv}`, `ENTITLEMENT_PUBLIC_KEY=${pub}`, ""].join("\n"), { mode: 0o600 });

console.log(`Private key written to ${OUT} (not printed).`);
console.log("Public key (put it in .env.local as VITE_ENTITLEMENT_PUBKEY):");
console.log(pub);
