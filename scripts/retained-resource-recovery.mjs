#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const recoveryScriptPath = fileURLToPath(import.meta.url);

export const recoveryActionNames = [
  "createChangeSet",
  "waitForChangeSet",
  "describeChangeSet",
  "executeChangeSet",
  "waitForImport",
  "detectDrift",
  "describeDrift",
  "setStackPolicy",
];

export const recoverySpecs = [
  {
    key: "web",
    workingDirectory: repositoryRoot,
    service: "learning-app-cloudfront",
    stage: "dev",
    region: "us-east-1",
    stackName: "learning-app-cloudfront-dev",
    printArgs: [],
    resources: [
      {
        logicalId: "WebAppS3Bucket",
        type: "AWS::S3::Bucket",
        identifierProperty: "BucketName",
        physicalName: "learning-app-cloudfront-50342117",
      },
    ],
  },
  {
    key: "user-service",
    workingDirectory: join(repositoryRoot, "server", "user-service"),
    service: "user-service",
    stage: "dev",
    region: "us-east-1",
    stackName: "user-service-dev",
    printArgs: ["--param=jwtSecretParameter=/learning-portal/test/jwt-secret"],
    resources: [
      {
        logicalId: "UserTable",
        type: "AWS::DynamoDB::Table",
        identifierProperty: "TableName",
        physicalName: "UserTable",
      },
      {
        logicalId: "StudentTable",
        type: "AWS::DynamoDB::Table",
        identifierProperty: "TableName",
        physicalName: "StudentTable",
      },
      {
        logicalId: "TrainerTable",
        type: "AWS::DynamoDB::Table",
        identifierProperty: "TableName",
        physicalName: "TrainerTable",
      },
      {
        logicalId: "SpecializationTable",
        type: "AWS::DynamoDB::Table",
        identifierProperty: "TableName",
        physicalName: "SpecializationTable",
      },
      {
        logicalId: "BlacklistedTokensTable",
        type: "AWS::DynamoDB::Table",
        identifierProperty: "TableName",
        physicalName: "BlacklistedTokensTable",
      },
    ],
  },
];

function fail(message) {
  throw new Error(`Retained-resource recovery invariant failed: ${message}`);
}

export function validateExpectedAccountId(expectedAccountId) {
  if (
    typeof expectedAccountId !== "string" ||
    !/^\d{12}$/.test(expectedAccountId)
  ) {
    fail("expected AWS account ID must be exactly 12 decimal digits");
  }
  return expectedAccountId;
}

export function renderServerlessConfig(spec) {
  const serverlessBinary = join(
    spec.workingDirectory,
    "node_modules",
    ".bin",
    "serverless",
  );
  if (!existsSync(serverlessBinary)) {
    fail(
      `missing ${serverlessBinary}; run npm ci in ${spec.workingDirectory} before generating a recovery plan`,
    );
  }

  const result = spawnSync(
    serverlessBinary,
    ["print", "--format", "json", "--stage", spec.stage, ...spec.printArgs],
    {
      cwd: spec.workingDirectory,
      encoding: "utf8",
      env: process.env,
    },
  );

  if (result.error) {
    fail(`could not render ${spec.key}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(
      `Serverless print failed for ${spec.key} with status ${result.status}: ${result.stderr.trim()}`,
    );
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    fail(
      `Serverless print returned invalid JSON for ${spec.key}: ${error.message}`,
    );
  }
}

export function buildStackRecovery(spec, renderedConfig) {
  const service = renderedConfig.service;
  const stage = renderedConfig.provider?.stage;
  const region = renderedConfig.provider?.region;
  const stackName = renderedConfig.provider?.stackName ?? `${service}-${stage}`;

  if (service !== spec.service) {
    fail(
      `${spec.key} service must be ${spec.service}, received ${String(service)}`,
    );
  }
  if (stage !== spec.stage) {
    fail(`${spec.key} stage must be ${spec.stage}, received ${String(stage)}`);
  }
  if (region !== spec.region) {
    fail(
      `${spec.key} region must be ${spec.region}, received ${String(region)}`,
    );
  }
  if (stackName !== spec.stackName) {
    fail(
      `${spec.key} stack name must be ${spec.stackName}, received ${String(stackName)}`,
    );
  }

  const configuredResources = renderedConfig.resources?.Resources;
  if (!configuredResources || typeof configuredResources !== "object") {
    fail(`${spec.key} has no rendered CloudFormation resources`);
  }

  const expectedIds = new Set(spec.resources.map(({ logicalId }) => logicalId));
  const retainedIds = Object.entries(configuredResources)
    .filter(
      ([, resource]) =>
        resource?.DeletionPolicy === "Retain" ||
        resource?.UpdateReplacePolicy === "Retain",
    )
    .map(([logicalId]) => logicalId);

  const unexpectedRetainedIds = retainedIds.filter(
    (logicalId) => !expectedIds.has(logicalId),
  );
  const missingRetainedIds = [...expectedIds].filter(
    (logicalId) => !retainedIds.includes(logicalId),
  );
  if (unexpectedRetainedIds.length > 0 || missingRetainedIds.length > 0) {
    fail(
      `${spec.key} recovery inventory differs from rendered retained resources; missing=[${missingRetainedIds.join(
        ", ",
      )}], unexpected=[${unexpectedRetainedIds.join(", ")}]`,
    );
  }

  const importResources = {};
  const resourcesToImport = [];

  for (const expected of spec.resources) {
    const resource = configuredResources[expected.logicalId];
    if (!resource) {
      fail(`${spec.key} is missing ${expected.logicalId}`);
    }
    if (resource.Type !== expected.type) {
      fail(`${spec.key}.${expected.logicalId} must have type ${expected.type}`);
    }
    if (resource.DeletionPolicy !== "Retain") {
      fail(`${spec.key}.${expected.logicalId} must have DeletionPolicy Retain`);
    }
    if (resource.UpdateReplacePolicy !== "Retain") {
      fail(
        `${spec.key}.${expected.logicalId} must have UpdateReplacePolicy Retain`,
      );
    }

    const physicalName = resource.Properties?.[expected.identifierProperty];
    if (typeof physicalName !== "string" || physicalName.length === 0) {
      fail(
        `${spec.key}.${expected.logicalId}.${expected.identifierProperty} must be a static string`,
      );
    }
    if (physicalName !== expected.physicalName) {
      fail(
        `${spec.key}.${expected.logicalId}.${expected.identifierProperty} must be ${expected.physicalName}, received ${physicalName}`,
      );
    }

    importResources[expected.logicalId] = structuredClone(resource);
    resourcesToImport.push({
      ResourceType: expected.type,
      LogicalResourceId: expected.logicalId,
      ResourceIdentifier: {
        [expected.identifierProperty]: physicalName,
      },
    });
  }

  return {
    key: spec.key,
    service,
    stage,
    region,
    stackName,
    template: {
      AWSTemplateFormatVersion: "2010-09-09",
      Description: `Import-only recovery template for retained resources from ${stackName}`,
      Resources: importResources,
    },
    resourcesToImport,
    stackPolicy: {
      Statement: [
        {
          Effect: "Allow",
          Action: "Update:*",
          Principal: "*",
          Resource: "*",
        },
        {
          Effect: "Deny",
          Action: ["Update:Replace", "Update:Delete"],
          Principal: "*",
          Resource: resourcesToImport.map(
            ({ LogicalResourceId }) => `LogicalResourceId/${LogicalResourceId}`,
          ),
        },
      ],
    },
  };
}

export function buildArchivalResourceImport({
  resource,
  sourceLogicalId,
  archivalLogicalId,
  identifierProperty,
  physicalName,
}) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(archivalLogicalId)) {
    fail(`archival logical ID is invalid: ${String(archivalLogicalId)}`);
  }
  if (archivalLogicalId === sourceLogicalId) {
    fail(
      `archival logical ID must differ from active logical ID ${sourceLogicalId}`,
    );
  }
  if (
    resource?.DeletionPolicy !== "Retain" ||
    resource?.UpdateReplacePolicy !== "Retain"
  ) {
    fail(
      `archival resource ${sourceLogicalId} must retain on deletion and replacement`,
    );
  }
  if (typeof physicalName !== "string" || physicalName.length === 0) {
    fail(`archival ${identifierProperty} must be a non-empty string`);
  }

  const archivalResource = structuredClone(resource);
  archivalResource.Properties ??= {};
  archivalResource.Properties[identifierProperty] = physicalName;

  return {
    template: {
      AWSTemplateFormatVersion: "2010-09-09",
      Description: `Import-only archival template for retained ${physicalName}`,
      Resources: {
        [archivalLogicalId]: archivalResource,
      },
    },
    resourcesToImport: [
      {
        ResourceType: archivalResource.Type,
        LogicalResourceId: archivalLogicalId,
        ResourceIdentifier: {
          [identifierProperty]: physicalName,
        },
      },
    ],
  };
}

function commandPlan(stack) {
  const changeSetName = "retained-resource-recovery";
  return {
    createChangeSet: [
      "aws",
      "cloudformation",
      "create-change-set",
      "--region",
      stack.region,
      "--stack-name",
      stack.stackName,
      "--change-set-name",
      changeSetName,
      "--change-set-type",
      "IMPORT",
      "--template-body",
      JSON.stringify(stack.template),
      "--resources-to-import",
      JSON.stringify(stack.resourcesToImport),
    ],
    waitForChangeSet: [
      "aws",
      "cloudformation",
      "wait",
      "change-set-create-complete",
      "--region",
      stack.region,
      "--stack-name",
      stack.stackName,
      "--change-set-name",
      changeSetName,
    ],
    describeChangeSet: [
      "aws",
      "cloudformation",
      "describe-change-set",
      "--region",
      stack.region,
      "--stack-name",
      stack.stackName,
      "--change-set-name",
      changeSetName,
    ],
    executeChangeSet: [
      "aws",
      "cloudformation",
      "execute-change-set",
      "--region",
      stack.region,
      "--stack-name",
      stack.stackName,
      "--change-set-name",
      changeSetName,
    ],
    waitForImport: [
      "aws",
      "cloudformation",
      "wait",
      "stack-import-complete",
      "--region",
      stack.region,
      "--stack-name",
      stack.stackName,
    ],
    detectDrift: [
      "aws",
      "cloudformation",
      "detect-stack-drift",
      "--region",
      stack.region,
      "--stack-name",
      stack.stackName,
    ],
    setStackPolicy: [
      "aws",
      "cloudformation",
      "set-stack-policy",
      "--region",
      stack.region,
      "--stack-name",
      stack.stackName,
      "--stack-policy-body",
      JSON.stringify(stack.stackPolicy),
    ],
  };
}

function gatedCommandPlan(
  manifestPath,
  expectedAccountId,
  stackKey,
  awsArguments,
) {
  const commands = Object.fromEntries(
    Object.keys(awsArguments).map((action) => [
      action,
      [
        "node",
        recoveryScriptPath,
        "run",
        "--plan",
        manifestPath,
        "--expected-account-id",
        expectedAccountId,
        "--stack",
        stackKey,
        "--action",
        action,
      ],
    ]),
  );
  commands.describeDrift = [
    "node",
    recoveryScriptPath,
    "run",
    "--plan",
    manifestPath,
    "--expected-account-id",
    expectedAccountId,
    "--stack",
    stackKey,
    "--action",
    "describeDrift",
    "--drift-id",
    "<drift-detection-id>",
  ];
  return commands;
}

export async function writeRecoveryBundle(
  outputDirectory,
  expectedAccountId,
  specs = recoverySpecs,
) {
  validateExpectedAccountId(expectedAccountId);
  const absoluteOutputDirectory = resolve(outputDirectory);

  const stacks = specs.map((spec) =>
    buildStackRecovery(spec, renderServerlessConfig(spec)),
  );
  await mkdir(dirname(absoluteOutputDirectory), {
    recursive: true,
    mode: 0o700,
  });
  try {
    await mkdir(absoluteOutputDirectory, { mode: 0o700 });
  } catch (error) {
    if (error?.code === "EEXIST") {
      fail(`output path already exists: ${absoluteOutputDirectory}`);
    }
    throw error;
  }

  const manifest = {
    schemaVersion: 2,
    expectedAccountId,
    warning:
      "These import-only templates are for an absent original stack. Use only the generated account-gated commands, and do not execute until region, stack absence, live resource properties, ownership, and every Import action are verified.",
    stacks: [],
  };

  const manifestPath = join(absoluteOutputDirectory, "recovery-plan.json");

  for (const stack of stacks) {
    const templateFile = `${stack.stackName}.import-template.json`;
    const resourceMapFile = `${stack.stackName}.resources-to-import.json`;
    const stackPolicyFile = `${stack.stackName}.durable-resource-stack-policy.json`;
    const templatePath = join(absoluteOutputDirectory, templateFile);
    const resourceMapPath = join(absoluteOutputDirectory, resourceMapFile);
    const stackPolicyPath = join(absoluteOutputDirectory, stackPolicyFile);

    await writeFile(
      templatePath,
      `${JSON.stringify(stack.template, null, 2)}\n`,
      { mode: 0o600 },
    );
    await writeFile(
      resourceMapPath,
      `${JSON.stringify(stack.resourcesToImport, null, 2)}\n`,
      {
        mode: 0o600,
      },
    );
    await writeFile(
      stackPolicyPath,
      `${JSON.stringify(stack.stackPolicy, null, 2)}\n`,
      { mode: 0o600 },
    );

    const awsArguments = commandPlan(stack);

    manifest.stacks.push({
      key: stack.key,
      service: stack.service,
      stage: stack.stage,
      region: stack.region,
      stackName: stack.stackName,
      templateFile,
      resourceMapFile,
      stackPolicyFile,
      logicalResourceIds: stack.resourcesToImport.map(
        ({ LogicalResourceId }) => LogicalResourceId,
      ),
      awsArguments,
      commands: gatedCommandPlan(
        manifestPath,
        expectedAccountId,
        stack.key,
        awsArguments,
      ),
    });
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
  });

  return { outputDirectory: absoluteOutputDirectory, manifest };
}

function spawnAws(spawn, args) {
  return spawn("aws", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, AWS_PAGER: "" },
    maxBuffer: 16 * 1024 * 1024,
  });
}

export function assertAwsAccount(expectedAccountId, spawn = spawnSync) {
  validateExpectedAccountId(expectedAccountId);
  const result = spawnAws(spawn, [
    "sts",
    "get-caller-identity",
    "--output",
    "json",
    "--no-cli-pager",
  ]);

  if (result.error) {
    fail(`could not verify AWS account identity: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(
      `AWS account identity check failed with status ${String(result.status)}: ${String(
        result.stderr ?? "",
      ).trim()}`,
    );
  }

  let identity;
  try {
    identity = JSON.parse(String(result.stdout ?? ""));
  } catch (error) {
    fail(`AWS account identity check returned invalid JSON: ${error.message}`);
  }

  if (!identity || typeof identity.Account !== "string") {
    fail("AWS account identity response did not contain an Account value");
  }
  if (identity.Account !== expectedAccountId) {
    fail(
      `AWS account mismatch: expected ${expectedAccountId}, received ${identity.Account}; no CloudFormation command was run`,
    );
  }

  return identity;
}

function requireArgumentValue(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1 || !args[index + 1] || args[index + 1].startsWith("--")) {
    fail(`missing required ${flag} argument`);
  }
  if (args.indexOf(flag, index + 1) !== -1) {
    fail(`duplicate ${flag} argument`);
  }
  return args[index + 1];
}

function assertOnlyArguments(args, flags) {
  const allowed = new Set(flags);
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    if (!allowed.has(flag) || !args[index + 1]) {
      fail(`unexpected or incomplete argument ${String(flag)}`);
    }
  }
}

function reconstructApprovedAwsArguments(
  manifest,
  { stackKey, action, driftId, planDirectory },
) {
  if (typeof planDirectory !== "string" || planDirectory.length === 0) {
    fail("recovery execution requires the recovery plan directory");
  }
  const absolutePlanDirectory = resolve(planDirectory);
  const expectedStackKeys = recoverySpecs.map(({ key }) => key);
  const actualStackKeys = manifest.stacks?.map(({ key }) => key);
  if (!isDeepStrictEqual(actualStackKeys, expectedStackKeys)) {
    fail("recovery plan stack inventory differs from the approved inventory");
  }

  const approvedStacks = new Map();
  for (const spec of recoverySpecs) {
    const stack = manifest.stacks.find(({ key }) => key === spec.key);
    if (!stack) {
      fail(`recovery plan has no stack key ${spec.key}`);
    }

    const expectedLogicalResourceIds = spec.resources.map(
      ({ logicalId }) => logicalId,
    );
    const expectedTemplateFile = `${spec.stackName}.import-template.json`;
    const expectedResourceMapFile = `${spec.stackName}.resources-to-import.json`;
    const expectedStackPolicyFile = `${spec.stackName}.durable-resource-stack-policy.json`;
    const expectedMetadata = {
      key: spec.key,
      service: spec.service,
      stage: spec.stage,
      region: spec.region,
      stackName: spec.stackName,
      templateFile: expectedTemplateFile,
      resourceMapFile: expectedResourceMapFile,
      stackPolicyFile: expectedStackPolicyFile,
      logicalResourceIds: expectedLogicalResourceIds,
    };
    for (const [field, expected] of Object.entries(expectedMetadata)) {
      if (!isDeepStrictEqual(stack[field], expected)) {
        fail(`${spec.key}.${field} differs from the approved recovery plan`);
      }
    }

    const expectedRecovery = buildStackRecovery(
      spec,
      renderServerlessConfig(spec),
    );
    const artifacts = [
      [expectedTemplateFile, expectedRecovery.template],
      [expectedResourceMapFile, expectedRecovery.resourcesToImport],
      [expectedStackPolicyFile, expectedRecovery.stackPolicy],
    ];
    for (const [fileName, expectedContent] of artifacts) {
      const artifactPath = join(absolutePlanDirectory, fileName);
      let actualContent;
      try {
        actualContent = JSON.parse(readFileSync(artifactPath, "utf8"));
      } catch (error) {
        fail(
          `could not validate recovery artifact ${fileName}: ${error.message}`,
        );
      }
      if (!isDeepStrictEqual(actualContent, expectedContent)) {
        fail(
          `recovery artifact ${fileName} differs from the currently rendered approved content`,
        );
      }
    }

    const expectedAwsArguments = commandPlan(expectedRecovery);
    if (!isDeepStrictEqual(stack.awsArguments, expectedAwsArguments)) {
      fail(
        `${spec.key} CloudFormation action arguments differ from the approved plan`,
      );
    }

    const expectedCommands = gatedCommandPlan(
      join(absolutePlanDirectory, "recovery-plan.json"),
      manifest.expectedAccountId,
      spec.key,
      expectedAwsArguments,
    );
    if (!isDeepStrictEqual(stack.commands, expectedCommands)) {
      fail(
        `${spec.key} account-gated command inventory differs from the approved plan`,
      );
    }

    approvedStacks.set(spec.key, { spec, expectedAwsArguments });
  }

  const approvedStack = approvedStacks.get(stackKey);
  if (!approvedStack) {
    fail(`recovery plan has no stack key ${String(stackKey)}`);
  }
  const { spec, expectedAwsArguments } = approvedStack;

  if (action === "describeDrift") {
    if (typeof driftId !== "string" || !/^[A-Za-z0-9-]{1,36}$/.test(driftId)) {
      fail("describeDrift requires a valid --drift-id value");
    }
    return [
      "aws",
      "cloudformation",
      "describe-stack-drift-detection-status",
      "--region",
      spec.region,
      "--stack-drift-detection-id",
      driftId,
    ];
  }

  return expectedAwsArguments[action];
}

export function executeRecoveryAction(
  manifest,
  { expectedAccountId, stackKey, action, driftId, planDirectory },
  spawn = spawnSync,
) {
  validateExpectedAccountId(expectedAccountId);
  if (manifest?.schemaVersion !== 2) {
    fail(
      `recovery plan schema must be 2, received ${String(manifest?.schemaVersion)}`,
    );
  }
  validateExpectedAccountId(manifest.expectedAccountId);
  if (manifest.expectedAccountId !== expectedAccountId) {
    fail(
      `expected account argument ${expectedAccountId} does not match recovery plan account ${manifest.expectedAccountId}`,
    );
  }
  if (!recoveryActionNames.includes(action)) {
    fail(`unsupported recovery action ${String(action)}`);
  }

  const awsArguments = reconstructApprovedAwsArguments(manifest, {
    stackKey,
    action,
    driftId,
    planDirectory,
  });

  const identity = assertAwsAccount(expectedAccountId, spawn);
  const result = spawnAws(spawn, [...awsArguments.slice(1), "--no-cli-pager"]);
  if (result.error) {
    fail(`could not run ${stackKey}.${action}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(
      `${stackKey}.${action} failed with status ${String(result.status)}: ${String(
        result.stderr ?? "",
      ).trim()}`,
    );
  }

  return { identity, result };
}

export async function executeRecoveryPlanFile(
  planPath,
  options,
  spawn = spawnSync,
) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(resolve(planPath), "utf8"));
  } catch (error) {
    fail(`could not read recovery plan ${resolve(planPath)}: ${error.message}`);
  }
  return executeRecoveryAction(
    manifest,
    { ...options, planDirectory: dirname(resolve(planPath)) },
    spawn,
  );
}

function parseGenerateArguments(argv) {
  assertOnlyArguments(argv, ["--out", "--expected-account-id"]);
  return {
    outputDirectory: requireArgumentValue(argv, "--out"),
    expectedAccountId: validateExpectedAccountId(
      requireArgumentValue(argv, "--expected-account-id"),
    ),
  };
}

function parseRunArguments(argv) {
  assertOnlyArguments(argv, [
    "--plan",
    "--expected-account-id",
    "--stack",
    "--action",
    "--drift-id",
  ]);
  const action = requireArgumentValue(argv, "--action");
  if (action !== "describeDrift" && argv.includes("--drift-id")) {
    fail("--drift-id is valid only for the describeDrift action");
  }
  return {
    planPath: requireArgumentValue(argv, "--plan"),
    expectedAccountId: validateExpectedAccountId(
      requireArgumentValue(argv, "--expected-account-id"),
    ),
    stackKey: requireArgumentValue(argv, "--stack"),
    action,
    driftId:
      action === "describeDrift"
        ? requireArgumentValue(argv, "--drift-id")
        : undefined,
  };
}

function usage() {
  return [
    "Usage:",
    "  node scripts/retained-resource-recovery.mjs --out <new-directory> --expected-account-id <12-digit-account-id>",
    "  node scripts/retained-resource-recovery.mjs run --plan <recovery-plan.json> --expected-account-id <12-digit-account-id> --stack <key> --action <action> [--drift-id <id>]",
  ].join("\n");
}

async function runCli(argv) {
  if (argv[0] === "run") {
    const { planPath, ...options } = parseRunArguments(argv.slice(1));
    const { identity, result } = await executeRecoveryPlanFile(
      planPath,
      options,
    );
    process.stdout.write(
      `AWS account verified: ${identity.Account}\n${String(result.stdout ?? "")}`,
    );
    return;
  }

  const { outputDirectory, expectedAccountId } = parseGenerateArguments(argv);
  const result = await writeRecoveryBundle(outputDirectory, expectedAccountId);
  process.stdout.write(
    `Recovery plan written to ${result.outputDirectory}\n` +
      `Expected AWS account: ${result.manifest.expectedAccountId}\n` +
      `${result.manifest.stacks
        .map(
          (stack) =>
            `${stack.stackName}: ${stack.logicalResourceIds.length} retained resource(s)`,
        )
        .join("\n")}\n`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n${usage()}\n`);
    process.exitCode = 1;
  }
}
