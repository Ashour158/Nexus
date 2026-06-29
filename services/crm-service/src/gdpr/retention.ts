/**
 * GDPR Retention Pipeline — Data retention and deletion policies.
 */

export interface RetentionPolicy {
  resourceType: string;
  retentionDays: number;
  anonymizeAfterDays?: number;
  hardDeleteAfterDays: number;
}

export const GDPR_RETENTION_POLICIES: RetentionPolicy[] = [
  { resourceType: 'Contact', retentionDays: 2555, anonymizeAfterDays: 2555, hardDeleteAfterDays: 3650 },
  { resourceType: 'Deal', retentionDays: 2555, hardDeleteAfterDays: 3650 },
  { resourceType: 'Activity', retentionDays: 730, hardDeleteAfterDays: 1095 },
  { resourceType: 'AuditLog', retentionDays: 2555, hardDeleteAfterDays: 3650 },
  { resourceType: 'Session', retentionDays: 30, hardDeleteAfterDays: 90 },
  { resourceType: 'Notification', retentionDays: 90, hardDeleteAfterDays: 180 },
];

export interface RetentionJob {
  id: string;
  tenantId: string;
  resourceType: string;
  action: 'anonymize' | 'delete';
  scheduledAt: Date;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export class GdprRetentionPipeline {
  private policies: Map<string, RetentionPolicy>;

  constructor(policies = GDPR_RETENTION_POLICIES) {
    this.policies = new Map(policies.map((p) => [p.resourceType, p]));
  }

  getPolicy(resourceType: string): RetentionPolicy | undefined {
    return this.policies.get(resourceType);
  }

  generateJobs(tenantId: string): RetentionJob[] {
    const jobs: RetentionJob[] = [];
    for (const policy of this.policies.values()) {
      if (policy.anonymizeAfterDays) {
        jobs.push({
          id: crypto.randomUUID(),
          tenantId,
          resourceType: policy.resourceType,
          action: 'anonymize',
          scheduledAt: new Date(Date.now() + policy.anonymizeAfterDays * 86400000),
          status: 'pending',
        });
      }
      jobs.push({
        id: crypto.randomUUID(),
        tenantId,
        resourceType: policy.resourceType,
        action: 'delete',
        scheduledAt: new Date(Date.now() + policy.hardDeleteAfterDays * 86400000),
        status: 'pending',
      });
    }
    return jobs;
  }

  /**
   * Recursively anonymize PII fields including nested JSON objects.
   * Handles top-level fields, nested objects, and arrays.
   */
  anonymizeRecord(record: Record<string, unknown>): Record<string, unknown> {
    return this.anonymizeValue(record) as Record<string, unknown>;
  }

  private anonymizeValue(value: unknown): unknown {
    if (value === null || value === undefined) return value;

    // Handle arrays recursively
    if (Array.isArray(value)) {
      return value.map((item) => this.anonymizeValue(item));
    }

    // Handle objects recursively
    if (typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        result[key] = this.anonymizeField(key, this.anonymizeValue(val));
      }
      return result;
    }

    return value;
  }

  private anonymizeField(fieldName: string, value: unknown): unknown {
    const piiFields = new Set([
      'email', 'phone', 'mobile', 'firstName', 'lastName', 'fullName',
      'address', 'street', 'city', 'state', 'zip', 'postalCode',
      'ssn', 'sin', 'nationalId', 'passport', 'driversLicense',
      'dateOfBirth', 'dob', 'birthDate', 'nationality',
      'personalEmail', 'emergencyPhone', 'emergencyContact',
      'salary', 'compensation', 'bankAccount', 'iban', 'swift',
      'taxId', 'vatNumber', 'companyRegNumber',
      'ipAddress', 'userAgent', 'fingerprint',
      'customFields', 'hrData', 'privateNotes',
    ]);

    const lowerField = fieldName.toLowerCase();
    if (piiFields.has(fieldName) || piiFields.has(lowerField) || lowerField.includes('pii') || lowerField.includes('personal')) {
      if (typeof value === 'string') {
        // Preserve email format for domain analysis but redact local part
        if (value.includes('@')) {
          const [, domain] = value.split('@');
          return `[REDACTED]@${domain}`;
        }
        return `[REDACTED-${fieldName.toUpperCase()}]`;
      }
      if (typeof value === 'number') return 0;
      if (typeof value === 'boolean') return false;
      if (value === null) return null;
      return '[REDACTED]';
    }

    return value;
  }
}
