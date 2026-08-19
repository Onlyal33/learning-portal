import {
  GetParameterCommand,
  SSMClient,
} from '@aws-sdk/client-ssm';

const MAX_CACHE_AGE_MS = 60_000;

type ParameterResult = { Parameter?: { Value?: unknown } };
type GetParameter = (parameterName: string) => Promise<ParameterResult>;

export type JwtSecretProviderDependencies = {
  clock?: () => number;
  getParameter?: GetParameter;
};

export class JwtSecretProvider {
  private cached?: { value: string; fetchedAt: number };
  private inFlight?: Promise<string>;
  private readonly clock: () => number;
  private readonly getParameter: GetParameter;

  constructor({ clock = Date.now, getParameter }: JwtSecretProviderDependencies = {}) {
    this.clock = clock;
    if (getParameter) {
      this.getParameter = getParameter;
    } else {
      const ssmClient = new SSMClient({
        region: process.env.AWS_REGION ?? process.env.REGION,
      });
      this.getParameter = async (parameterName) =>
        ssmClient.send(
          new GetParameterCommand({ Name: parameterName, WithDecryption: true }),
        );
    }
  }

  async getJwtSecret(): Promise<string> {
    if (this.cached && this.clock() - this.cached.fetchedAt < MAX_CACHE_AGE_MS) {
      return this.cached.value;
    }
    if (!this.inFlight) {
      this.inFlight = this.readSecret().finally(() => {
        this.inFlight = undefined;
      });
    }
    return this.inFlight;
  }

  private async readSecret(): Promise<string> {
    const parameterName = process.env.JWT_SECRET_PARAMETER;
    if (!parameterName?.trim()) {
      throw new Error('JWT secret identifier is unavailable');
    }
    const result = await this.getParameter(parameterName);
    const value = result.Parameter?.Value;
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error('JWT secret value is unavailable');
    }
    this.cached = { value, fetchedAt: this.clock() };
    return value;
  }
}

const jwtSecretProvider = new JwtSecretProvider();

export const getJwtSecret = (): Promise<string> => jwtSecretProvider.getJwtSecret();
