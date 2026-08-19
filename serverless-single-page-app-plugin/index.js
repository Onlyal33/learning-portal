"use strict";

const { randomUUID } = require("node:crypto");

class ServerlessPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
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
    const provider = this.serverless.getProvider("aws");
    const stackName = provider.naming.getStackName();
    const result = await provider.request("CloudFormation", "describeStacks", {
      StackName: stackName,
    });
    const outputs = result?.Stacks?.[0]?.Outputs;
    const output = outputs?.find(
      (entry) => entry.OutputKey === "WebAppCloudFrontDistributionOutput",
    );
    if (output?.OutputValue) {
      this.serverless.cli.log(`Web App Domain: ${output.OutputValue}`);
      return output.OutputValue;
    }
    this.serverless.cli.log("Web App Domain: Not Found");
    throw new Error("Could not extract Web App Domain");
  }

  async invalidateCache() {
    const provider = this.serverless.getProvider("aws");
    const domain = await this.domainInfo();
    const distribution = await this.findDistribution(provider, domain);
    if (!distribution?.Id) {
      const message = `Could not find distribution with domain ${domain}`;
      this.serverless.cli.log(message);
      throw new Error(message);
    }
    this.serverless.cli.log(
      `Invalidating CloudFront distribution with id: ${distribution.Id}`,
    );
    await provider.request("CloudFront", "createInvalidation", {
      DistributionId: distribution.Id,
      InvalidationBatch: {
        CallerReference: randomUUID(),
        Paths: { Quantity: 1, Items: ["/*"] },
      },
    });
    this.serverless.cli.log("Successfully invalidated CloudFront cache");
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
