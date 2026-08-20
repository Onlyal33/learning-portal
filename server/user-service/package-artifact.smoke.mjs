import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertDynamoDbTablesRetained,
  assertNoExternalIamPolicies,
} from "./scripts/package-invariants.mjs";

const fail = (message) => {
  throw new Error(message);
};

const packageDirectory = ".serverless";
const archives = readdirSync(packageDirectory).filter((name) =>
  name.endsWith(".zip"),
);
if (archives.length !== 1) {
  fail(`expected one Lambda archive, found ${archives.length}`);
}

const archivePath = join(packageDirectory, archives[0]);
const compressedBytes = statSync(archivePath).size;
if (compressedBytes > 2 * 1024 * 1024) {
  fail(`Lambda archive is too large: ${compressedBytes} bytes`);
}

const entries = execFileSync("unzip", ["-Z1", archivePath], {
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter(Boolean);
if (
  entries.length !== 2 ||
  !entries.includes(".build/index.js") ||
  !entries.includes(".build/package.json")
) {
  fail(`unexpected Lambda archive entries: ${entries.join(", ")}`);
}

const bundle = execFileSync("unzip", ["-p", archivePath, ".build/index.js"], {
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});
const moduleManifest = execFileSync(
  "unzip",
  ["-p", archivePath, ".build/package.json"],
  { encoding: "utf8" },
);
if (JSON.parse(moduleManifest).type !== "module") {
  fail("Lambda archive does not declare the ESM module type");
}

const listing = execFileSync("unzip", ["-l", archivePath], {
  encoding: "utf8",
});
const totalMatch = listing.match(/\n\s*(\d+)\s+\d+ files?\s*\n?$/);
if (!totalMatch) {
  fail("could not determine uncompressed Lambda archive size");
}
const uncompressedBytes = Number(totalMatch[1]);
if (uncompressedBytes > 8 * 1024 * 1024) {
  fail(`Lambda archive expands beyond the size gate: ${uncompressedBytes}`);
}

const template = JSON.parse(
  readFileSync(
    join(packageDirectory, "cloudformation-template-update-stack.json"),
    "utf8",
  ),
);
assertNoExternalIamPolicies(template);
assertDynamoDbTablesRetained(template);
const lambdaResources = Object.entries(template.Resources).filter(
  ([, resource]) => resource.Type === "AWS::Lambda::Function",
);
if (lambdaResources.length !== 8) {
  fail(`expected eight Lambda resources, found ${lambdaResources.length}`);
}

const secretConsumers = new Set([
  "JwtAuthorizerLambdaFunction",
  "LoginUserLambdaFunction",
]);
const expectedRoles = {
  JwtAuthorizerLambdaFunction: "JwtAuthorizerLambdaRole",
  LoginUserLambdaFunction: "LoginLambdaRole",
};
for (const [logicalId, resource] of lambdaResources) {
  const properties = resource.Properties;
  if (properties.Runtime !== "nodejs24.x") {
    fail(`${logicalId} does not use nodejs24.x`);
  }
  if (properties.Handler !== ".build/index." + handlerName(logicalId)) {
    fail(`${logicalId} has an unexpected handler: ${properties.Handler}`);
  }

  const variables = properties.Environment?.Variables ?? {};
  if ("JWT_SECRET" in variables) {
    fail(`${logicalId} materializes JWT_SECRET`);
  }
  const hasParameterName = "JWT_SECRET_PARAMETER" in variables;
  if (hasParameterName !== secretConsumers.has(logicalId)) {
    fail(`${logicalId} has the wrong JWT parameter scope`);
  }

  const roleLogicalId = properties.Role?.["Fn::GetAtt"]?.[0];
  const expectedRole = expectedRoles[logicalId] ?? "IamRoleLambdaExecution";
  if (roleLogicalId !== expectedRole) {
    fail(`${logicalId} is bound to unexpected role: ${roleLogicalId}`);
  }
}

const lambdaRoleIds = new Set(
  lambdaResources.map(
    ([, resource]) => resource.Properties.Role["Fn::GetAtt"][0],
  ),
);
const basicExecutionPolicy =
  "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole";
for (const roleLogicalId of lambdaRoleIds) {
  if (template.Resources[roleLogicalId]?.Type !== "AWS::IAM::Role") {
    fail(`missing Lambda execution role: ${roleLogicalId}`);
  }
}
for (const [roleLogicalId, role] of Object.entries(template.Resources).filter(
  ([, resource]) => resource.Type === "AWS::IAM::Role",
)) {
  const expectedManagedPolicies =
    roleLogicalId === "JwtAuthorizerLambdaRole" ||
    roleLogicalId === "LoginLambdaRole"
      ? [basicExecutionPolicy]
      : [];
  const managedPolicies = role.Properties.ManagedPolicyArns ?? [];
  if (
    managedPolicies.length !== expectedManagedPolicies.length ||
    managedPolicies.some(
      (policy, index) => policy !== expectedManagedPolicies[index],
    )
  ) {
    fail(
      `${roleLogicalId} has unexpected managed policies: ${JSON.stringify(managedPolicies)}`,
    );
  }
}

const serialized = JSON.stringify(template);
for (const forbidden of [
  "local-development-only",
  "test-secret",
  "secretsmanager:GetSecretValue",
]) {
  if (serialized.includes(forbidden) || bundle.includes(forbidden)) {
    fail(`generated artifact contains forbidden content: ${forbidden}`);
  }
}
if (
  Object.values(template.Resources).some(
    (resource) =>
      resource.Type === "AWS::SSM::Parameter" ||
      resource.Type === "AWS::KMS::Key",
  ) ||
  serialized.includes("kms:Decrypt")
) {
  fail("template creates or grants an unapproved parameter/KMS resource");
}

const permissionStatements = Object.entries(template.Resources).flatMap(
  ([logicalId, resource]) =>
    (resource.Properties?.Policies ?? []).flatMap((policy) =>
      (policy.PolicyDocument?.Statement ?? []).map((statement) => ({
        logicalId,
        statement,
        actions: Array.isArray(statement.Action)
          ? statement.Action
          : [statement.Action],
      })),
    ),
);
if (
  permissionStatements.some(({ actions }) =>
    actions.some(
      (action) => typeof action === "string" && action.startsWith("kms:"),
    ),
  )
) {
  fail("template grants an unapproved KMS action");
}
const ssmStatements = permissionStatements.filter(({ actions }) =>
  actions.some(
    (action) => typeof action === "string" && action.startsWith("ssm:"),
  ),
);
if (ssmStatements.length !== 2) {
  fail(
    `expected two scoped ssm:GetParameter grants, found ${ssmStatements.length}`,
  );
}
const expectedSsmRoles = new Set([
  "JwtAuthorizerLambdaRole",
  "LoginLambdaRole",
]);
for (const { logicalId, statement, actions } of ssmStatements) {
  if (actions.length !== 1 || actions[0] !== "ssm:GetParameter") {
    fail(`unexpected SSM action on ${logicalId}: ${actions.join(", ")}`);
  }
  if (!expectedSsmRoles.delete(logicalId)) {
    fail(`unexpected SSM permission-bearing role: ${logicalId}`);
  }
  const resourceParts = statement.Resource?.["Fn::Join"]?.[1];
  if (
    !Array.isArray(resourceParts) ||
    resourceParts.at(-1) !== "/learning-portal/test/jwt-secret" ||
    !resourceParts.includes(":parameter") ||
    !resourceParts.some((part) => part?.Ref === "AWS::AccountId")
  ) {
    fail(
      `unexpected SSM parameter resource: ${JSON.stringify(statement.Resource)}`,
    );
  }
}
if (expectedSsmRoles.size !== 0) {
  fail(
    `missing SSM permission-bearing roles: ${[...expectedSsmRoles].join(", ")}`,
  );
}

const scalingResources = Object.entries(template.Resources).filter(
  ([, resource]) =>
    resource.Type === "AWS::ApplicationAutoScaling::ScalableTarget" ||
    resource.Type === "AWS::ApplicationAutoScaling::ScalingPolicy" ||
    resource.Type === "AWS::CloudWatch::Alarm",
);
if (scalingResources.length !== 0) {
  fail(
    `fixed-capacity package contains scaling/alarm resources: ${scalingResources
      .map(([logicalId]) => logicalId)
      .join(", ")}`,
  );
}
if (
  serialized.includes("application-autoscaling.amazonaws.com") ||
  serialized.includes("cloudwatch:PutMetricAlarm")
) {
  fail("fixed-capacity package retains an auto-scaling role or permission");
}

const expectedTableIndexes = new Map([
  ["UserTable", ["email-index"]],
  ["StudentTable", []],
  ["TrainerTable", []],
  ["SpecializationTable", []],
  ["BlacklistedTokensTable", []],
]);
const tableResources = Object.entries(template.Resources).filter(
  ([, resource]) => resource.Type === "AWS::DynamoDB::Table",
);
if (tableResources.length !== expectedTableIndexes.size) {
  fail(`expected ${expectedTableIndexes.size} fixed-capacity DynamoDB tables`);
}
for (const [logicalId, table] of tableResources) {
  const expectedIndexes = expectedTableIndexes.get(logicalId);
  if (!expectedIndexes) {
    fail(`unexpected DynamoDB table: ${logicalId}`);
  }
  const throughput = table.Properties.ProvisionedThroughput;
  if (
    throughput?.ReadCapacityUnits !== 1 ||
    throughput?.WriteCapacityUnits !== 1
  ) {
    fail(`${logicalId} is not fixed at 1 RCU and 1 WCU`);
  }

  const indexes = table.Properties.GlobalSecondaryIndexes ?? [];
  if (
    indexes.length !== expectedIndexes.length ||
    indexes.some(
      (index, position) => index.IndexName !== expectedIndexes[position],
    )
  ) {
    fail(`${logicalId} has unexpected global secondary indexes`);
  }
  for (const index of indexes) {
    if (
      index.ProvisionedThroughput?.ReadCapacityUnits !== 1 ||
      index.ProvisionedThroughput?.WriteCapacityUnits !== 1
    ) {
      fail(`${logicalId}/${index.IndexName} is not fixed at 1 RCU and 1 WCU`);
    }
  }
}

const authorizers = Object.values(template.Resources).filter(
  (resource) => resource.Type === "AWS::ApiGatewayV2::Authorizer",
);
if (
  authorizers.length !== 1 ||
  authorizers[0].Properties.AuthorizerResultTtlInSeconds !== 0
) {
  fail("HTTP API authorizer caching is not disabled");
}

const expectedCors = {
  AllowHeaders: [
    "content-type",
    "x-amz-date",
    "authorization",
    "x-api-key",
    "x-amz-security-token",
    "x-amz-user-agent",
    "x-amzn-trace-id",
  ],
  AllowMethods: ["OPTIONS", "POST", "GET", "DELETE", "PUT"],
  AllowOrigins: ["*"],
};
const actualCors = template.Resources.HttpApi?.Properties?.CorsConfiguration;
if (JSON.stringify(actualCors) !== JSON.stringify(expectedCors)) {
  fail(`HTTP API CORS is not canonical: ${JSON.stringify(actualCors)}`);
}

const extractionDirectory = mkdtempSync(
  join(tmpdir(), "user-service-package-"),
);
try {
  execFileSync("unzip", ["-q", archivePath, "-d", extractionDirectory]);
  const handlers = await import(
    pathToFileURL(join(extractionDirectory, ".build/index.js")).href
  );
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
      fail(`extracted Lambda archive is missing handler: ${name}`);
    }
  }
} finally {
  rmSync(extractionDirectory, { recursive: true, force: true });
}

function handlerName(logicalId) {
  return logicalId
    .replace(/LambdaFunction$/, "")
    .replace(/^[A-Z]/, (letter) => letter.toLowerCase());
}
