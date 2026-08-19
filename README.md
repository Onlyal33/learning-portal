# LearningPortal

Visit here https://d3kvc3xcywtbiu.cloudfront.net

This project uses [Angular CLI](https://github.com/angular/angular-cli) 21 and Node.js 22.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Deployment safety

`npm run client:deploy` uploads the built client through Serverless Finch without
emptying the bucket or changing bucket configuration, policies, or CORS. It still
replaces any existing object whose key is present in the built client.
`npm run cloudfront:invalidateCache` uses the configured Serverless AWS
provider to issue a CloudFront `/*` invalidation after the upload; it does not
require the AWS CLI. The web bucket is retained if its CloudFormation stack is
deleted or replaced.

`Retain` preserves the bucket data, but it does not preserve CloudFormation
ownership after stack deletion. **Do not run `sls remove` and then attempt a
normal redeploy.** The redeploy will try to create the same fixed bucket name and
fail. The five fixed-name DynamoDB tables have the same recovery boundary.

Before removing either stack or replacing a durable resource, follow the
[retained-resource recovery and replacement runbook](docs/retained-resource-recovery.md).
The runbook restores every retained resource to CloudFormation management without
deleting preserved data. Generate its import-only templates and exact identifier
maps from the currently rendered Serverless configurations with:

```bash
npm run retained-resources:plan -- \
  --out /absolute/path/to/new-recovery-directory \
  --expected-account-id <12-digit-aws-account-id>
```

Generation is offline, records the expected account, and refuses to overwrite an
existing directory. Every generated CloudFormation action runs through an account
gate that calls STS immediately beforehand and rejects any caller-account
mismatch. Before STS, it also re-renders and compares the complete import
template, resource map, and stack policy; CloudFormation receives reconstructed
inline JSON rather than mutable artifact paths. Execution remains a separate,
state-changing AWS operation that requires region verification, backups,
change-set review, and an approved non-production drill.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
