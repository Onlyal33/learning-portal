"use strict";

const { randomUUID } = require("node:crypto");

class ServerlessPlugin {
  constructor(serverless, options, { log } = {}) {
    this.serverless = serverless;
    this.options = options;
    this.provider = serverless.getProvider("aws");
    this.log =
      typeof log === "function" ? log : serverless.cli.log.bind(serverless.cli);
    this.commands = {
      domainInfo: {
        usage: "Fetches and prints out the deployed CloudFront domain names",
        lifecycleEvents: ["domainInfo"],
      },
      invalidateCloudFrontCache: {
        usage: "Invalidates CloudFront cache",
        lifecycleEvents: ["invalidateCache"],
      },
    };
    this.hooks = {
      "domainInfo:domainInfo": this.domainInfo.bind(this),
      "invalidateCloudFrontCache:invalidateCache":
        this.invalidateCache.bind(this),
    };
  }

  async domainInfo() {
    const stackName = this.provider.naming.getStackName();
    const result = await this.provider.request(
      "CloudFormation",
      "describeStacks",
      { StackName: stackName },
    );
    const outputs = result?.Stacks?.[0]?.Outputs;
    const output = outputs?.find(
      (entry) => entry.OutputKey === "WebAppCloudFrontDistributionOutput",
    );
    if (output?.OutputValue) {
      this.log(`Web App Domain: ${output.OutputValue}`);
      return output.OutputValue;
    }
    this.log("Web App Domain: Not Found");
    throw new Error("Could not extract Web App Domain");
  }

  async invalidateCache() {
    const domain = await this.domainInfo();
    const distribution = await this.findDistribution(this.provider, domain);
    if (!distribution?.Id) {
      const message = `Could not find distribution with domain ${domain}`;
      this.log(message);
      throw new Error(message);
    }
    this.log(
      `Invalidating CloudFront distribution with id: ${distribution.Id}`,
    );
    await this.provider.request("CloudFront", "createInvalidation", {
      DistributionId: distribution.Id,
      InvalidationBatch: {
        CallerReference: randomUUID(),
        Paths: { Quantity: 1, Items: ["/*"] },
      },
    });
    this.log("Successfully invalidated CloudFront cache");
  }

  async findDistribution(provider, domain) {
    let marker;
    do {
      const result = await provider.request(
        "CloudFront",
        "listDistributions",
        marker ? { Marker: marker } : {},
      );
      const page = result?.DistributionList;
      const distribution = page?.Items?.find(
        (entry) => entry.DomainName === domain,
      );
      if (distribution) return distribution;
      if (!page?.IsTruncated) return undefined;
      if (!page.NextMarker || page.NextMarker === marker) {
        throw new Error("CloudFront returned an invalid pagination marker");
      }
      marker = page.NextMarker;
    } while (marker);
    return undefined;
  }
}

module.exports = ServerlessPlugin;
