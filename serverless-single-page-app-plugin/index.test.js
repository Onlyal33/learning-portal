"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");
const ServerlessPlugin = require("./index.js");
const packageJson = require("../package.json");

function createPlugin(request) {
  const logs = [];
  const provider = {
    naming: { getStackName: () => "learning-app-cloudfront-test" },
    request,
  };
  const plugin = new ServerlessPlugin(
    {
      cli: { log: (message) => logs.push(message) },
      getProvider: (name) => {
        assert.equal(name, "aws");
        return provider;
      },
    },
    {},
  );
  return { plugin, logs };
}

function domainStack() {
  return {
    Stacks: [
      {
        Outputs: [
          {
            OutputKey: "WebAppCloudFrontDistributionOutput",
            OutputValue: "d111111abcdef8.cloudfront.net",
          },
        ],
      },
    ],
  };
}

test("keeps client deployment non-destructive without changing its safety flags", () => {
  assert.equal(
    packageJson.scripts["client:deploy"],
    "sls client deploy --no-config-change --no-policy-change --no-cors-change --no-delete-contents",
  );
});

test("retains the rendered web bucket on deletion and replacement", () => {
  const serviceRoot = path.join(__dirname, "..");
  const rendered = JSON.parse(
    execFileSync(
      process.execPath,
      [
        path.join(serviceRoot, "node_modules/serverless/bin/serverless.js"),
        "print",
        "--format",
        "json",
      ],
      { cwd: serviceRoot, encoding: "utf8" },
    ),
  );
  const bucket = rendered.resources.Resources.WebAppS3Bucket;
  assert.equal(bucket.Type, "AWS::S3::Bucket");
  assert.equal(bucket.DeletionPolicy, "Retain");
  assert.equal(bucket.UpdateReplacePolicy, "Retain");
  assert.equal(bucket.Properties.BucketName, rendered.custom.client.bucketName);
});

test("invalidates the matching CloudFront distribution through the provider", async () => {
  const calls = [];
  const { plugin, logs } = createPlugin(async (...args) => {
    calls.push(args);
    if (args[1] === "describeStacks") return domainStack();
    if (args[1] === "listDistributions") {
      return {
        DistributionList: {
          Items: [{ Id: "E123", DomainName: "d111111abcdef8.cloudfront.net" }],
        },
      };
    }
    return {};
  });
  await plugin.invalidateCache();
  assert.deepEqual(calls.slice(0, 2), [
    [
      "CloudFormation",
      "describeStacks",
      { StackName: "learning-app-cloudfront-test" },
    ],
    ["CloudFront", "listDistributions", {}],
  ]);
  const invalidation = calls[2];
  assert.deepEqual(invalidation.slice(0, 2), [
    "CloudFront",
    "createInvalidation",
  ]);
  assert.equal(invalidation[2].DistributionId, "E123");
  assert.match(
    invalidation[2].InvalidationBatch.CallerReference,
    /^[0-9a-f-]{36}$/i,
  );
  assert.deepEqual(invalidation[2].InvalidationBatch.Paths, {
    Quantity: 1,
    Items: ["/*"],
  });
  assert.equal(invalidation.length, 3);
  assert.deepEqual(logs, [
    "Web App Domain: d111111abcdef8.cloudfront.net",
    "Invalidating CloudFront distribution with id: E123",
    "Successfully invalidated CloudFront cache",
  ]);
});

test("fails before listing distributions when the stack has no domain output", async () => {
  const calls = [];
  const { plugin } = createPlugin(async (...args) => {
    calls.push(args);
    return { Stacks: [{}] };
  });
  await assert.rejects(
    plugin.invalidateCache(),
    /Could not extract Web App Domain/,
  );
  assert.equal(calls.length, 1);
});

test("fails when no distribution matches the stack domain", async () => {
  const { plugin } = createPlugin(async (_service, method) =>
    method === "describeStacks"
      ? domainStack()
      : { DistributionList: { Items: [] } },
  );
  await assert.rejects(
    plugin.invalidateCache(),
    /Could not find distribution with domain d111111abcdef8.cloudfront.net/,
  );
});

test("finds a distribution on a later CloudFront page", async () => {
  const calls = [];
  const { plugin } = createPlugin(async (...args) => {
    calls.push(args);
    if (args[1] === "describeStacks") return domainStack();
    if (args[1] === "listDistributions" && !args[2].Marker) {
      return {
        DistributionList: {
          IsTruncated: true,
          NextMarker: "page-2",
          Items: [{ Id: "OTHER", DomainName: "other.cloudfront.net" }],
        },
      };
    }
    if (args[1] === "listDistributions") {
      return {
        DistributionList: {
          IsTruncated: false,
          Items: [{ Id: "E123", DomainName: "d111111abcdef8.cloudfront.net" }],
        },
      };
    }
    return {};
  });
  await plugin.invalidateCache();
  assert.deepEqual(calls[2], [
    "CloudFront",
    "listDistributions",
    { Marker: "page-2" },
  ]);
  assert.equal(calls[3][1], "createInvalidation");
});

test("rejects a truncated CloudFront page without a next marker", async () => {
  const { plugin } = createPlugin(async (_service, method) =>
    method === "describeStacks"
      ? domainStack()
      : { DistributionList: { IsTruncated: true, Items: [] } },
  );
  await assert.rejects(
    plugin.invalidateCache(),
    /CloudFront returned an invalid pagination marker/,
  );
});

test("propagates provider failures without reporting a successful invalidation", async () => {
  const expected = new Error("CloudFront unavailable");
  const { plugin, logs } = createPlugin(async (_service, method) => {
    if (method === "describeStacks") return domainStack();
    if (method === "listDistributions") {
      return {
        DistributionList: {
          Items: [{ Id: "E123", DomainName: "d111111abcdef8.cloudfront.net" }],
        },
      };
    }
    throw expected;
  });
  await assert.rejects(plugin.invalidateCache(), (error) => error === expected);
  assert.ok(!logs.includes("Successfully invalidated CloudFront cache"));
});
