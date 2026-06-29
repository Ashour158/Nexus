# Security Breach Response Runbook

## Immediate Actions (First 15 Minutes)

1. **Isolate affected systems**
   ```bash
   kubectl scale deployment/<affected-service> --replicas=0 -n nexus
   ```

2. **Revoke compromised credentials**
   ```bash
   # Rotate JWT keys
   pnpm rotate-jwt
   
   # Rotate database passwords
   aws secretsmanager rotate-secret --secret-id nexus-crm/postgres
   ```

3. **Enable enhanced logging**
   ```bash
   kubectl set env deployment/<service> LOG_LEVEL=debug -n nexus
   ```

## Investigation (First Hour)

1. **Collect evidence**
   ```bash
   ./scripts/forensics.sh <incident-id>
   ```

2. **Review audit logs**
   ```bash
   # Query audit events from Kafka
   kafkacat -b kafka:9092 -t audit.events -o -1000
   ```

3. **Check access logs**
   ```bash
   # WAF logs
   aws wafv2 get-sampled-requests --web-acl-arn <arn> --rule-name RateLimit
   
   # Nginx access logs
   kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx --tail=1000
   ```

## Remediation

1. **Patch vulnerabilities**
   ```bash
   # Update dependencies
   pnpm audit --fix
   
   # Rebuild and redeploy
   ./scripts/deploy-service.sh <service>
   ```

2. **Verify integrity**
   ```bash
   # Image verification
   ./scripts/verify-images.sh
   
   # Dependency check
   ./scripts/dependency-check.sh
   ```

## Communication

- Notify security team immediately
- Document all findings
- Prepare breach notification if PII involved
- Engage legal team for GDPR/privacy compliance
