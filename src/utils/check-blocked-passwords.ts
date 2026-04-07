export function containsBlockedPasswords(
  password: string,
  email: string,
  username: string,
  blockedList: string[] = []
): boolean {
  const pwd = password.toLowerCase();
  const emailLocal = email.split("@")[0].toLowerCase();
  const uname = username.toLowerCase();

  const blockedTerms = [emailLocal, uname, ...blockedList.map((w) => w.toLowerCase())];

  return blockedTerms.some((term) => term && pwd.includes(term));
}
