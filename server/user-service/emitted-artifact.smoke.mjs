const moduleUrl = new URL('./.build/index.js', import.meta.url);
const handlers = await import(moduleUrl.href);

for (const name of [
  'jwtAuthorizer', 'registerUser', 'loginUser', 'logoutUser',
  'getCurrentUser', 'deleteCurrentUser', 'updateCurrentUser', 'updatePassword',
]) {
  if (typeof handlers[name] !== 'function') {
    throw new Error(`Missing emitted handler: ${name}`);
  }
}
