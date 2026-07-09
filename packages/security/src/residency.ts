/**
 * Data Residency — Route data to region-specific storage.
 */

export interface ResidencyConfig {
  defaultRegion: string;
  regionMap: Record<string, { databaseUrl: string; redisUrl: string; s3Bucket: string }>;
}

export class DataResidencyRouter {
  constructor(private config: ResidencyConfig) {}

  getRegion(tenantRegion?: string): string {
    return tenantRegion && this.config.regionMap[tenantRegion]
      ? tenantRegion
      : this.config.defaultRegion;
  }

  getDatabaseUrl(tenantRegion?: string): string {
    const region = this.getRegion(tenantRegion);
    return this.config.regionMap[region]?.databaseUrl ?? '';
  }

  getRedisUrl(tenantRegion?: string): string {
    const region = this.getRegion(tenantRegion);
    return this.config.regionMap[region]?.redisUrl ?? '';
  }

  getS3Bucket(tenantRegion?: string): string {
    const region = this.getRegion(tenantRegion);
    return this.config.regionMap[region]?.s3Bucket ?? '';
  }

  isDataTransferAllowed(fromRegion: string, toRegion: string): boolean {
    if (fromRegion.startsWith('EU') && !toRegion.startsWith('EU')) {
      return false;
    }
    return true;
  }
}

export async function residencyHook(request: { headers: Record<string, string | undefined> }): Promise<void> {
  const region = request.headers['x-tenant-region'] ?? 'us-east-1';
  (request as Record<string, unknown>).residencyRegion = region;
}
