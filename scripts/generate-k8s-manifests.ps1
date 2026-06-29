$services = @(
    @{ Name = "activities-service"; Port = 3043 },
    @{ Name = "analytics-service"; Port = 3008 },
    @{ Name = "approval-service"; Port = 3014 },
    @{ Name = "blueprint-service"; Port = 3013 },
    @{ Name = "cadence-service"; Port = 3018 },
    @{ Name = "chatbot-service"; Port = 3017 },
    @{ Name = "comm-service"; Port = 3009 },
    @{ Name = "contacts-service"; Port = 3041 },
    @{ Name = "crm-service"; Port = 3001 },
    @{ Name = "data-service"; Port = 3015 },
    @{ Name = "deals-service"; Port = 3042 },
    @{ Name = "document-service"; Port = 3016 },
    @{ Name = "email-sync-service"; Port = 3600 },
    @{ Name = "finance-service"; Port = 3002 },
    @{ Name = "graphql-gateway"; Port = 4000 },
    @{ Name = "incentive-service"; Port = 3024 },
    @{ Name = "integration-service"; Port = 3012 },
    @{ Name = "knowledge-service"; Port = 3023 },
    @{ Name = "metadata-service"; Port = 3004 },
    @{ Name = "notification-service"; Port = 3003 },
    @{ Name = "planning-service"; Port = 3020 },
    @{ Name = "portal-service"; Port = 3022 },
    @{ Name = "realtime-service"; Port = 3005 },
    @{ Name = "reporting-service"; Port = 3021 },
    @{ Name = "router-coprocessor"; Port = 4001 },
    @{ Name = "search-service"; Port = 3006 },
    @{ Name = "storage-service"; Port = 3010 },
    @{ Name = "territory-service"; Port = 3019 },
    @{ Name = "workflow-service"; Port = 3007 }
)

$template = @'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {0}
  namespace: nexus
  labels:
    app.kubernetes.io/name: nexus-{0}
    app.kubernetes.io/component: backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app.kubernetes.io/name: nexus-{0}
  template:
    metadata:
      labels:
        app.kubernetes.io/name: nexus-{0}
        app.kubernetes.io/component: backend
    spec:
      securityContext:
        runAsNonRoot: true
      containers:
      - name: {0}
        image: ghcr.io/nexus-crm/nexus-{0}:latest
        ports:
        - containerPort: {1}
          name: http
        env:
        - name: PORT
          value: "{1}"
        - name: SERVICE_DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: nexus-secrets
              key: {0}-database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: nexus-secrets
              key: redis-url
        - name: KAFKA_BROKERS
          valueFrom:
            configMapKeyRef:
              name: nexus-config
              key: KAFKA_BROKERS
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: {1}
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: {1}
          initialDelaySeconds: 5
          periodSeconds: 5
        securityContext:
          readOnlyRootFilesystem: false
          allowPrivilegeEscalation: false
---
apiVersion: v1
kind: Service
metadata:
  name: {0}
  namespace: nexus
  labels:
    app.kubernetes.io/name: nexus-{0}
    app.kubernetes.io/component: backend
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: nexus-{0}
  ports:
  - name: http
    port: {1}
    targetPort: {1}
'@

$created = @()
foreach ($svc in $services) {
    $name = $svc.Name
    $port = $svc.Port
    $content = $template -f $name, $port
    $path = "infrastructure/k8s/$name.yaml"
    Set-Content -Path $path -Value $content -Encoding UTF8
    $created += $path
}

Write-Host "Created $($created.Count) manifest files:"
$created | ForEach-Object { Write-Host "  $_" }
