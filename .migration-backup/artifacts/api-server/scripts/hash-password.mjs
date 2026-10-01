import { randomBytes, scryptSync } from "node:crypto";
import process from "node:process";

function readHidden(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Run this command in an interactive terminal.");
  }

  return new Promise((resolve, reject) => {
    let value = "";
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const finish = (error) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };

    const onData = (chunk) => {
      const key = chunk.toString("utf8");
      if (key === "\u0003") {
        finish(new Error("Cancelled."));
        return;
      }
      if (key === "\r" || key === "\n") {
        finish();
        return;
      }
      if (key === "\u007f" || key === "\b") {
        value = Array.from(value).slice(0, -1).join("");
        return;
      }
      if (!key.startsWith("\u001b")) value += key;
    };

    process.stdin.on("data", onData);
  });
}

try {
  const first = await readHidden("New admin password: ");
  if (first.length < 12) {
    throw new Error("Use a password with at least 12 characters.");
  }
  const confirmation = await readHidden("Confirm password: ");
  if (first !== confirmation) {
    throw new Error("The passwords do not match.");
  }
  const salt = randomBytes(16);
  const digest = scryptSync(first, salt, 64);
  process.stdout.write(
    `ADMIN_PASSWORD_HASH=scrypt$${salt.toString("hex")}$${digest.toString("hex")}\n`,
  );
} catch (error) {
  process.stderr.write(`${error.message ?? "Unable to hash password."}\n`);
  process.exitCode = 1;
}