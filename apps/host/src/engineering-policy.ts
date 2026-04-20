const TEST_LIKE_PATH = /(^|\/)(tests?|__tests__|__mocks__|fixtures?|specs?)(\/|$)|\.(test|spec)\./i;
const CODE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|swift)$/i;

export function isTestLikePath(path: string) {
  return TEST_LIKE_PATH.test(path);
}

export function isImplementationCodePath(path: string) {
  if (isTestLikePath(path)) return false;
  return CODE_EXTENSIONS.test(path);
}

export function shouldEnforceTddForPath(path: string) {
  return isImplementationCodePath(path);
}
