# Generate Helm charts for all missing NEXUS CRM microservices
$services = @(
    @{ Name = "nexus-activities"; Port = 3001; DbName = "nexus_activities" },
    @{ Name = "nexus-analytics"; Port = 3008; DbName = "nexus_analytics" },
    @{ Name = "nexus-approval"; Port = 3014; DbName = "nexus_approval" },
    @{ Name = "nexus-blueprint"; Port = 3013; DbName = "nexus_blueprint" },
    @{ Name = "nexus-cadence"; Port = 3018; DbName = "nexus_cadence" },
    @{ Name = "nexus-chatbot"; Port = 3017; DbName = "nexus_chatbot" },
    @{ Name = "nexus-comm"; Port = 3009; DbName = "nexus_comm" },
    @{ Name = "nexus-contacts"; Port = 3001; DbName = "nexus_contacts" },
    @{ Name = "nexus-data"; Port = 3015; DbName = "nexus_data" },
    @{ Name = "nexus-deals"; Port = 3001; DbName = "nexus_deals" },
    @{ Name = "nexus-document"; Port = 3016; DbName = "nexus_document" },
    @{ Name = "nexus-email-sync"; Port = 3026; DbName = "nexus_email_sync" },
    @{ Name = "nexus-finance"; Port = 3002; DbName = "nexus_finance" },
    @{ Name = "nexus-graphql-gateway"; Port = 4000; DbName = "nexus_graphql_gateway" },
    @{ Name = "nexus-incentive"; Port = 3024; DbName = "nexus_incentive" },
    @{ Name = "nexus-integration"; Port = 3012; DbName = "nexus_integration" },
    @{ Name = "nexus-knowledge"; Port = 3023; DbName = "nexus_knowledge" },
    @{ Name = "nexus-metadata"; Port = 3001; DbName = "nexus_metadata" },
    @{ Name = "nexus-notification"; Port = 3003; DbName = "nexus_notification" },
    @{ Name = "nexus-planning"; Port = 3020; DbName = "nexus_planning" },
    @{ Name = "nexus-portal"; Port = 3022; DbName = "nexus_portal" },
    @{ Name = "nexus-realtime"; Port = 3005; DbName = "nexus_realtime" },
    @{ Name = "nexus-reporting"; Port = 3021; DbName = "nexus_reporting" },
    @{ Name = "nexus-router-coprocessor"; Port = 4001; DbName = "nexus_router_coprocessor" },
    @{ Name = "nexus-search"; Port = 3006; DbName = "nexus_search" },
    @{ Name = "nexus-storage"; Port = 3010; DbName = "nexus_storage" },
    @{ Name = "nexus-territory"; Port = 3019; DbName = "nexus_territory" },
    @{ Name = "nexus-workflow"; Port = 3007; DbName = "nexus_workflow" }
)

$basePath = "infrastructure/helm"

foreach ($svc in $services) {
    $chartName = $svc.Name
    $port = $svc.Port
    $dbName = $svc.DbName
    $chartPath = "$basePath/$chartName"
    $templatesPath = "$chartPath/templates"

    New-Item -ItemType Directory -Path $templatesPath -Force | Out-Null

    # Chart.yaml
    $chartYaml = @"
apiVersion: v2
name: $chartName
description: A Helm chart for $chartName microservice
type: application
version: 1.0.0
appVersion: "1.0.0"
"@
    Set-Content -Path "$chartPath/Chart.yaml" -Value $chartYaml

    # values.yaml
    $dbUrlEnvName = (($dbName -replace "nexus_", "").ToUpper() -replace "-", "_") + "_DATABASE_URL"
    $valuesYaml = @"
global:
  imageRegistry: ""
  imagePullSecrets: []
  storageClass: ""

replicaCount: 2

image:
  repository: ghcr.io/nexus-crm/$chartName
  pullPolicy: IfNotPresent
  tag: "v1.0.0"

service:
  type: ClusterIP
  port: 80

resources:
  limits:
    cpu: 1000m
    memory: 1Gi
  requests:
    cpu: 250m
    memory: 512Mi

podSecurityContext:
  runAsNonRoot: true
  runAsUser: 1001
  fsGroup: 1001

securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop:
      - ALL

autoscaling:
  enabled: true
  minReplicas: 1
  maxReplicas: 3
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80

podDisruptionBudget:
  enabled: true
  minAvailable: 1

env:
  ${dbUrlEnvName}: "postgresql://nexus_app@nexus-pgbouncer:6432/$dbName"
  PORT: "$port"
"@
    Set-Content -Path "$chartPath/values.yaml" -Value $valuesYaml

    # _helpers.tpl
    $helpersTpl = @'
{{/*
Expand the name of the chart.
*/}}
{{- define "CHART_NAME.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "CHART_NAME.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "CHART_NAME.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "CHART_NAME.labels" -}}
helm.sh/chart: {{ include "CHART_NAME.chart" . }}
{{ include "CHART_NAME.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "CHART_NAME.selectorLabels" -}}
app.kubernetes.io/name: {{ include "CHART_NAME.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
'@ -replace "CHART_NAME", $chartName

    Set-Content -Path "$templatesPath/_helpers.tpl" -Value $helpersTpl

    # deployment.yaml
    $deploymentYaml = @"
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "$chartName.fullname" . }}
  labels:
    {{- include "$chartName.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "$chartName.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "$chartName.selectorLabels" . | nindent 8 }}
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- if .Values.podSecurityContext }}
      securityContext:
        {{- toYaml .Values.podSecurityContext | nindent 8 }}
      {{- end }}
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchExpressions:
                    - key: app.kubernetes.io/name
                      operator: In
                      values:
                        - {{ include "$chartName.name" . }}
                topologyKey: kubernetes.io/hostname
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          {{- if .Values.securityContext }}
          securityContext:
            {{- toYaml .Values.securityContext | nindent 12 }}
          {{- end }}
          ports:
            - name: http
              containerPort: $port
              protocol: TCP
          livenessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /ready
              port: http
            initialDelaySeconds: 5
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3
          startupProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 10
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 30
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
          envFrom:
            - configMapRef:
                name: nexus-config
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: nexus-postgres
                  key: url
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: nexus-redis
                  key: url
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: nexus-auth
                  key: jwt-secret
            - name: KAFKA_BROKERS
              valueFrom:
                secretKeyRef:
                  name: nexus-kafka
                  key: brokers
            - name: SERVICE_NAME
              value: "$chartName"
            - name: PORT
              value: "$port"
"@
    Set-Content -Path "$templatesPath/deployment.yaml" -Value $deploymentYaml

    # service.yaml
    $serviceYaml = @"
apiVersion: v1
kind: Service
metadata:
  name: {{ include "$chartName.fullname" . }}
  labels:
    {{- include "$chartName.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: http
      protocol: TCP
      name: http
  selector:
    {{- include "$chartName.selectorLabels" . | nindent 4 }}
"@
    Set-Content -Path "$templatesPath/service.yaml" -Value $serviceYaml

    # hpa.yaml
    $hpaYaml = @"
{{- if .Values.autoscaling.enabled }}
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ include "$chartName.fullname" . }}
  labels:
    {{- include "$chartName.labels" . | nindent 4 }}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {{ include "$chartName.fullname" . }}
  minReplicas: {{ .Values.autoscaling.minReplicas }}
  maxReplicas: {{ .Values.autoscaling.maxReplicas }}
  metrics:
    {{- if .Values.autoscaling.targetCPUUtilizationPercentage }}
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetCPUUtilizationPercentage }}
    {{- end }}
    {{- if .Values.autoscaling.targetMemoryUtilizationPercentage }}
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetMemoryUtilizationPercentage }}
    {{- end }}
{{- end }}
"@
    Set-Content -Path "$templatesPath/hpa.yaml" -Value $hpaYaml

    Write-Host "Created Helm chart for $chartName"
}

Write-Host "Done! Created $($services.Count) Helm charts."
