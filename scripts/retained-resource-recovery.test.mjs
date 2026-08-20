import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  buildArchivalResourceImport,
  buildStackRecovery,
  executeRecoveryAction,
  recoveryActionNames,
  recoverySpecs,
  renderServerlessConfig,
  writeRecoveryBundle,
} from "./retained-resource-recovery.mjs";

const expectedAccountId = "123456789012";

function clone(value) {
  return structuredClone(value);
}

test("rendered deployment configs produce an exact six-resource recovery inventory", () => {
  const recoveries = recoverySpecs.map((spec) =>
    buildStackRecovery(spec, renderServerlessConfig(spec)),
  );

  assert.deepEqual(
    recoveries.map(({ stackName }) => stackName),
    ["learning-app-cloudfront-dev", "user-service-dev"],
  );
  assert.deepEqual(
    recoveries.flatMap(({ resourcesToImport }) =>
      resourcesToImport.map(({ LogicalResourceId }) => LogicalResourceId),
    ),
    [
      "WebAppS3Bucket",
      "UserTable",
      "StudentTable",
      "TrainerTable",
      "SpecializationTable",
      "BlacklistedTokensTable",
    ],
  );

  for (const recovery of recoveries) {
    assert.equal(
      Object.keys(recovery.template.Resources).length,
      recovery.resourcesToImport.length,
    );
    for (const mapping of recovery.resourcesToImport) {
      const resource = recovery.template.Resources[mapping.LogicalResourceId];
      assert.equal(resource.Type, mapping.ResourceType);
      assert.equal(resource.DeletionPolicy, "Retain");
      assert.equal(resource.UpdateReplacePolicy, "Retain");
      assert.equal(Object.keys(mapping.ResourceIdentifier).length, 1);
    }
    assert.deepEqual(recovery.stackPolicy.Statement[1], {
      Effect: "Deny",
      Action: ["Update:Replace", "Update:Delete"],
      Principal: "*",
      Resource: recovery.resourcesToImport.map(
        ({ LogicalResourceId }) => `LogicalResourceId/${LogicalResourceId}`,
      ),
    });
  }
});

test("recovery bundle emits import-only templates, identifiers, and guarded commands", async (t) => {
  const parent = await mkdtemp(
    join(tmpdir(), "learning-portal-recovery-test-"),
  );
  t.after(() => rm(parent, { recursive: true, force: true }));
  const output = join(parent, "plan");
  const { manifest } = await writeRecoveryBundle(output, expectedAccountId);

  assert.equal(manifest.expectedAccountId, expectedAccountId);
  assert.equal(manifest.stacks.length, 2);
  for (const stack of manifest.stacks) {
    const template = JSON.parse(
      await readFile(join(output, stack.templateFile), "utf8"),
    );
    const identifiers = JSON.parse(
      await readFile(join(output, stack.resourceMapFile), "utf8"),
    );
    const stackPolicy = JSON.parse(
      await readFile(join(output, stack.stackPolicyFile), "utf8"),
    );
    assert.deepEqual(Object.keys(template.Resources), stack.logicalResourceIds);
    assert.deepEqual(
      identifiers.map(({ LogicalResourceId }) => LogicalResourceId),
      stack.logicalResourceIds,
    );
    assert.ok(stack.awsArguments.createChangeSet.includes("IMPORT"));
    assert.ok(!stack.awsArguments.createChangeSet.includes("CREATE"));
    assert.ok(!stack.awsArguments.createChangeSet.includes("--tags"));
    assert.ok(
      !stack.awsArguments.createChangeSet.some((argument) =>
        argument.startsWith("Key="),
      ),
    );
    assert.ok(
      stack.awsArguments.waitForImport.includes("stack-import-complete"),
    );
    assert.deepEqual(
      stackPolicy.Statement[1].Resource,
      stack.logicalResourceIds.map((id) => `LogicalResourceId/${id}`),
    );
    const createArguments = stack.awsArguments.createChangeSet;
    assert.deepEqual(
      JSON.parse(
        createArguments[createArguments.indexOf("--template-body") + 1],
      ),
      template,
    );
    assert.deepEqual(
      JSON.parse(
        createArguments[createArguments.indexOf("--resources-to-import") + 1],
      ),
      identifiers,
    );
    assert.ok(stack.awsArguments.setStackPolicy.includes("set-stack-policy"));
    const policyArguments = stack.awsArguments.setStackPolicy;
    assert.deepEqual(
      JSON.parse(
        policyArguments[policyArguments.indexOf("--stack-policy-body") + 1],
      ),
      stackPolicy,
    );
    assert.ok(
      !Object.values(stack.awsArguments)
        .flat()
        .some((argument) => argument.startsWith("file://")),
    );
    for (const command of Object.values(stack.commands)) {
      assert.equal(command[0], "node");
      assert.ok(command.includes("run"));
      assert.ok(command.includes("--expected-account-id"));
      assert.ok(command.includes(expectedAccountId));
      assert.ok(!command.includes("cloudformation"));
    }
    assert.equal(
      (await stat(join(output, stack.templateFile))).mode & 0o777,
      0o600,
    );
    assert.equal(
      (await stat(join(output, stack.resourceMapFile))).mode & 0o777,
      0o600,
    );
    assert.equal(
      (await stat(join(output, stack.stackPolicyFile))).mode & 0o777,
      0o600,
    );
  }
  assert.equal(
    (await stat(join(output, "recovery-plan.json"))).mode & 0o777,
    0o600,
  );

  await assert.rejects(
    () => writeRecoveryBundle(output, expectedAccountId),
    /output path already exists/,
  );
});

test("recovery plan generation rejects missing and malformed expected account IDs", async (t) => {
  const parent = await mkdtemp(
    join(tmpdir(), "learning-portal-recovery-account-test-"),
  );
  t.after(() => rm(parent, { recursive: true, force: true }));

  await assert.rejects(
    () => writeRecoveryBundle(join(parent, "missing")),
    /exactly 12 decimal digits/,
  );
  await assert.rejects(
    () => writeRecoveryBundle(join(parent, "short"), "1234"),
    /exactly 12 decimal digits/,
  );
  await assert.rejects(
    () => writeRecoveryBundle(join(parent, "letters"), "12345678901x"),
    /exactly 12 decimal digits/,
  );
});

test("concurrent recovery generation grants exactly one writer a new output directory", async (t) => {
  const parent = await mkdtemp(
    join(tmpdir(), "learning-portal-recovery-concurrency-test-"),
  );
  t.after(() => rm(parent, { recursive: true, force: true }));
  const output = join(parent, "nested", "plan");

  const attempts = await Promise.allSettled([
    writeRecoveryBundle(output, expectedAccountId, []),
    writeRecoveryBundle(output, expectedAccountId, []),
  ]);
  const fulfilled = attempts.filter(({ status }) => status === "fulfilled");
  const rejected = attempts.filter(({ status }) => status === "rejected");

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].reason.message, /output path already exists/);
  assert.equal(
    JSON.parse(await readFile(join(output, "recovery-plan.json"), "utf8"))
      .expectedAccountId,
    expectedAccountId,
  );
});

test("every recovery action checks the expected AWS account immediately before CloudFormation", async (t) => {
  const parent = await mkdtemp(
    join(tmpdir(), "learning-portal-recovery-execution-test-"),
  );
  t.after(() => rm(parent, { recursive: true, force: true }));
  const planDirectory = join(parent, "plan");
  const { manifest } = await writeRecoveryBundle(
    planDirectory,
    expectedAccountId,
  );
  const calls = [];
  const spawn = (executable, args) => {
    calls.push([executable, args]);
    if (args[0] === "sts") {
      return {
        status: 0,
        stdout: JSON.stringify({
          Account: expectedAccountId,
          Arn: "arn:aws:iam::123456789012:user/recovery-test",
          UserId: "recovery-test",
        }),
        stderr: "",
      };
    }
    return { status: 0, stdout: "{}", stderr: "" };
  };

  for (const action of recoveryActionNames) {
    const before = calls.length;
    executeRecoveryAction(
      manifest,
      {
        expectedAccountId,
        stackKey: "web",
        action,
        planDirectory,
        driftId:
          action === "describeDrift"
            ? "11111111-2222-3333-4444-555555555555"
            : undefined,
      },
      spawn,
    );
    assert.equal(calls.length, before + 2);
    assert.deepEqual(calls[before].slice(0, 2), [
      "aws",
      ["sts", "get-caller-identity", "--output", "json", "--no-cli-pager"],
    ]);
    assert.equal(calls[before + 1][0], "aws");
    assert.equal(calls[before + 1][1][0], "cloudformation");
  }
});

test("missing, mismatched, failed, and malformed account checks run no CloudFormation command", async (t) => {
  const parent = await mkdtemp(
    join(tmpdir(), "learning-portal-recovery-rejection-test-"),
  );
  t.after(() => rm(parent, { recursive: true, force: true }));
  const planDirectory = join(parent, "plan");
  const { manifest } = await writeRecoveryBundle(
    planDirectory,
    expectedAccountId,
  );
  const options = {
    expectedAccountId,
    stackKey: "web",
    action: "createChangeSet",
    planDirectory,
  };

  for (const scenario of [
    {
      name: "missing argument",
      options: { stackKey: "web", action: "createChangeSet" },
      result: null,
      error: /exactly 12 decimal digits/,
      expectedCalls: 0,
    },
    {
      name: "argument-plan mismatch",
      options: { ...options, expectedAccountId: "999999999999" },
      result: null,
      error: /does not match recovery plan account/,
      expectedCalls: 0,
    },
    {
      name: "caller mismatch",
      options,
      result: {
        status: 0,
        stdout: JSON.stringify({ Account: "999999999999" }),
        stderr: "",
      },
      error: /AWS account mismatch.*no CloudFormation command was run/,
      expectedCalls: 1,
    },
    {
      name: "STS failure",
      options,
      result: { status: 1, stdout: "", stderr: "not authenticated" },
      error: /identity check failed/,
      expectedCalls: 1,
    },
    {
      name: "malformed STS response",
      options,
      result: { status: 0, stdout: "not-json", stderr: "" },
      error: /invalid JSON/,
      expectedCalls: 1,
    },
  ]) {
    const calls = [];
    const spawn = (executable, args) => {
      calls.push([executable, args]);
      if (args[0] === "cloudformation") {
        throw new Error(`CloudFormation should not run for ${scenario.name}`);
      }
      return scenario.result;
    };

    assert.throws(
      () => executeRecoveryAction(manifest, scenario.options, spawn),
      scenario.error,
      scenario.name,
    );
    assert.equal(calls.length, scenario.expectedCalls, scenario.name);
    assert.equal(
      calls.filter(([, args]) => args[0] === "cloudformation").length,
      0,
      scenario.name,
    );
  }
});

test("modified recovery plans cannot change an allowlisted CloudFormation action", async (t) => {
  const parent = await mkdtemp(
    join(tmpdir(), "learning-portal-recovery-hostile-plan-test-"),
  );
  t.after(() => rm(parent, { recursive: true, force: true }));
  const planDirectory = join(parent, "plan");
  const { manifest } = await writeRecoveryBundle(
    planDirectory,
    expectedAccountId,
  );
  const baseOptions = {
    expectedAccountId,
    stackKey: "web",
    action: "createChangeSet",
    planDirectory,
  };

  const mutations = [
    {
      name: "injected delete-stack",
      mutate(plan) {
        plan.stacks[0].awsArguments.createChangeSet = [
          "aws",
          "cloudformation",
          "delete-stack",
          "--region",
          "us-east-1",
          "--stack-name",
          "learning-app-cloudfront-dev",
        ];
      },
    },
    {
      name: "changed change-set type",
      mutate(plan) {
        const args = plan.stacks[0].awsArguments.createChangeSet;
        args[args.indexOf("IMPORT")] = "UPDATE";
      },
    },
    {
      name: "changed template path",
      mutate(plan) {
        const args = plan.stacks[0].awsArguments.createChangeSet;
        args[args.indexOf("--template-body") + 1] =
          "file:///tmp/unreviewed-template.json";
      },
    },
    {
      name: "changed stack-policy path",
      options: { ...baseOptions, action: "setStackPolicy" },
      mutate(plan) {
        const args = plan.stacks[0].awsArguments.setStackPolicy;
        args[args.indexOf("--stack-policy-body") + 1] =
          "file:///tmp/unreviewed-policy.json";
      },
    },
    {
      name: "arbitrary extra flag",
      mutate(plan) {
        plan.stacks[0].awsArguments.createChangeSet.push(
          "--role-arn",
          "arn:aws:iam::123456789012:role/UnreviewedRole",
        );
      },
    },
    {
      name: "injected import tags",
      mutate(plan) {
        plan.stacks[0].awsArguments.createChangeSet.push(
          "--tags",
          "Key=STAGE,Value=dev",
        );
      },
    },
    {
      name: "legacy web import tags while running a sibling action",
      options: { ...baseOptions, action: "waitForChangeSet" },
      mutate(plan) {
        plan.stacks[0].awsArguments.createChangeSet.push(
          "--tags",
          "Key=STAGE,Value=dev",
        );
      },
    },
    {
      name: "legacy backend import tags while running a sibling action",
      options: {
        ...baseOptions,
        stackKey: "user-service",
        action: "waitForChangeSet",
      },
      mutate(plan) {
        plan.stacks[1].awsArguments.createChangeSet.push(
          "--tags",
          "Key=STAGE,Value=dev",
        );
      },
    },
    {
      name: "legacy backend import tags while running a web action",
      options: { ...baseOptions, action: "waitForChangeSet" },
      mutate(plan) {
        plan.stacks[1].awsArguments.createChangeSet.push(
          "--tags",
          "Key=STAGE,Value=dev",
        );
      },
    },
    {
      name: "legacy web import tags while running a backend action",
      options: {
        ...baseOptions,
        stackKey: "user-service",
        action: "waitForChangeSet",
      },
      mutate(plan) {
        plan.stacks[0].awsArguments.createChangeSet.push(
          "--tags",
          "Key=STAGE,Value=dev",
        );
      },
    },
    {
      name: "changed region",
      mutate(plan) {
        plan.stacks[0].region = "us-west-2";
      },
    },
    {
      name: "changed stack name",
      mutate(plan) {
        plan.stacks[0].stackName = "different-stack";
      },
    },
  ];

  for (const mutation of mutations) {
    const changed = clone(manifest);
    mutation.mutate(changed);
    const calls = [];
    assert.throws(
      () =>
        executeRecoveryAction(
          changed,
          mutation.options ?? baseOptions,
          (executable, args) => {
            calls.push([executable, args]);
            return {
              status: 0,
              stdout: JSON.stringify({ Account: expectedAccountId }),
              stderr: "",
            };
          },
        ),
      /differ(?:s)? from the approved|inventory differs/,
      mutation.name,
    );
    assert.equal(calls.length, 0, mutation.name);
  }
});

test("modified, missing, and malformed recovery artifacts stop before any AWS call", async (t) => {
  const parent = await mkdtemp(
    join(tmpdir(), "learning-portal-recovery-hostile-artifact-test-"),
  );
  t.after(() => rm(parent, { recursive: true, force: true }));
  const planDirectory = join(parent, "plan");
  const { manifest } = await writeRecoveryBundle(
    planDirectory,
    expectedAccountId,
  );
  const stack = manifest.stacks[0];
  const paths = {
    template: join(planDirectory, stack.templateFile),
    resourceMap: join(planDirectory, stack.resourceMapFile),
    stackPolicy: join(planDirectory, stack.stackPolicyFile),
  };
  const originals = Object.fromEntries(
    await Promise.all(
      Object.entries(paths).map(async ([key, path]) => [
        key,
        await readFile(path, "utf8"),
      ]),
    ),
  );

  const mutations = [
    {
      name: "import template",
      key: "template",
      path: paths.template,
      action: "createChangeSet",
      error:
        /recovery artifact .* differs from the currently rendered approved content/,
      content() {
        const changed = JSON.parse(originals.template);
        changed.Resources.WebAppS3Bucket.Properties.BucketName =
          "attacker-controlled-bucket";
        return `${JSON.stringify(changed, null, 2)}\n`;
      },
    },
    {
      name: "resource map",
      key: "resourceMap",
      path: paths.resourceMap,
      action: "createChangeSet",
      error:
        /recovery artifact .* differs from the currently rendered approved content/,
      content() {
        const changed = JSON.parse(originals.resourceMap);
        changed[0].ResourceIdentifier.BucketName = "attacker-controlled-bucket";
        return `${JSON.stringify(changed, null, 2)}\n`;
      },
    },
    {
      name: "stack policy",
      key: "stackPolicy",
      path: paths.stackPolicy,
      action: "setStackPolicy",
      error:
        /recovery artifact .* differs from the currently rendered approved content/,
      content() {
        const changed = JSON.parse(originals.stackPolicy);
        changed.Statement = changed.Statement.filter(
          ({ Effect }) => Effect !== "Deny",
        );
        return `${JSON.stringify(changed, null, 2)}\n`;
      },
    },
    ...Object.entries(paths).flatMap(([key, path]) => {
      const action =
        key === "stackPolicy" ? "setStackPolicy" : "createChangeSet";
      return [
        {
          name: `missing ${key}`,
          key,
          path,
          action,
          remove: true,
          error: /could not validate recovery artifact/,
        },
        {
          name: `malformed ${key}`,
          key,
          path,
          action,
          error: /could not validate recovery artifact/,
          content: () => "{not-json",
        },
      ];
    }),
  ];

  for (const mutation of mutations) {
    if (mutation.remove) {
      await rm(mutation.path);
    } else {
      await writeFile(mutation.path, mutation.content(), { mode: 0o600 });
    }
    try {
      const calls = [];
      assert.throws(
        () =>
          executeRecoveryAction(
            manifest,
            {
              expectedAccountId,
              stackKey: "web",
              action: mutation.action,
              planDirectory,
            },
            (executable, args) => {
              calls.push([executable, args]);
              return {
                status: 0,
                stdout: JSON.stringify({ Account: expectedAccountId }),
                stderr: "",
              };
            },
          ),
        mutation.error,
        mutation.name,
      );
      assert.equal(calls.length, 0, mutation.name);
    } finally {
      await writeFile(mutation.path, originals[mutation.key], { mode: 0o600 });
    }
  }
});

test("a retained predecessor uses a fresh archival logical ID while the active ID remains owned", () => {
  const webSpec = recoverySpecs[0];
  const webRecovery = buildStackRecovery(
    webSpec,
    renderServerlessConfig(webSpec),
  );
  const archivedBucket = buildArchivalResourceImport({
    resource: webRecovery.template.Resources.WebAppS3Bucket,
    sourceLogicalId: "WebAppS3Bucket",
    archivalLogicalId: "ArchivedWebAppS3Bucket2026",
    identifierProperty: "BucketName",
    physicalName: "learning-app-cloudfront-retained-archive",
  });

  assert.equal(archivedBucket.template.Resources.WebAppS3Bucket, undefined);
  assert.equal(
    archivedBucket.template.Resources.ArchivedWebAppS3Bucket2026.Properties
      .BucketName,
    "learning-app-cloudfront-retained-archive",
  );
  assert.deepEqual(archivedBucket.resourcesToImport, [
    {
      ResourceType: "AWS::S3::Bucket",
      LogicalResourceId: "ArchivedWebAppS3Bucket2026",
      ResourceIdentifier: {
        BucketName: "learning-app-cloudfront-retained-archive",
      },
    },
  ]);

  assert.throws(
    () =>
      buildArchivalResourceImport({
        resource: webRecovery.template.Resources.WebAppS3Bucket,
        sourceLogicalId: "WebAppS3Bucket",
        archivalLogicalId: "WebAppS3Bucket",
        identifierProperty: "BucketName",
        physicalName: "learning-app-cloudfront-retained-archive",
      }),
    /must differ from active logical ID/,
  );
});

test("recovery generation fails closed when a retained resource loses either policy", () => {
  const spec = recoverySpecs[0];
  const rendered = renderServerlessConfig(spec);

  for (const policy of ["DeletionPolicy", "UpdateReplacePolicy"]) {
    const changed = clone(rendered);
    delete changed.resources.Resources.WebAppS3Bucket[policy];
    assert.throws(
      () => buildStackRecovery(spec, changed),
      /recovery inventory differs|must have/,
    );
  }
});

test("recovery generation fails closed for dynamic, renamed, or untracked retained resources", () => {
  const spec = recoverySpecs[0];
  const rendered = renderServerlessConfig(spec);

  const dynamicName = clone(rendered);
  dynamicName.resources.Resources.WebAppS3Bucket.Properties.BucketName = {
    Ref: "UnexpectedParameter",
  };
  assert.throws(
    () => buildStackRecovery(spec, dynamicName),
    /must be a static string/,
  );

  const renamed = clone(rendered);
  renamed.resources.Resources.WebAppS3Bucket.Properties.BucketName =
    "different-bucket";
  assert.throws(
    () => buildStackRecovery(spec, renamed),
    /must be learning-app-cloudfront/,
  );

  const untracked = clone(rendered);
  untracked.resources.Resources.UntrackedRetainedBucket = {
    Type: "AWS::S3::Bucket",
    DeletionPolicy: "Retain",
    UpdateReplacePolicy: "Retain",
    Properties: { BucketName: "untracked-retained-bucket" },
  };
  assert.throws(
    () => buildStackRecovery(spec, untracked),
    /unexpected=\[UntrackedRetainedBucket\]/,
  );
});
