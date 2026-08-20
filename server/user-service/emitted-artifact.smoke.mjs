const moduleUrl = new URL("./.build/index.js", import.meta.url);
const handlers = await import(moduleUrl.href);

for (const name of [
  "jwtAuthorizer",
  "registerUser",
  "loginUser",
  "logoutUser",
  "getCurrentUser",
  "deleteCurrentUser",
  "updateCurrentUser",
  "updatePassword",
]) {
  if (typeof handlers[name] !== "function") {
    throw new Error(`Missing emitted handler: ${name}`);
  }
}

if (handlers.jwtAuthorizer.length > 2) {
  throw new Error(
    "Emitted JWT authorizer uses a callback-based handler signature",
  );
}

let authorizerRejection;
try {
  await handlers.jwtAuthorizer(
    { type: "REQUEST", headers: {}, routeArn: "arn:aws:execute-api:test" },
    {},
  );
} catch (error) {
  authorizerRejection = error;
}
if (authorizerRejection?.message !== "Unauthorized") {
  throw new Error(
    "Emitted JWT authorizer is not an async Unauthorized handler",
  );
}
