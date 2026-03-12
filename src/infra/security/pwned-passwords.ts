import { sha1 } from "js-sha1";

export async function isBreachedPassword(password: string): Promise<boolean> {
  const hash = sha1(password).toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
  if (!response.ok) return false;

  const lines = (await response.text()).split("\n");
  return lines.some((line) => line.split(":")[0] === suffix);
}
