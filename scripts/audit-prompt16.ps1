$results = @()
function Add-Result($name, $ok, $detail) { $results += [pscustomobject]@{ Check=$name; Status=if($ok){'PASS'}else{'FAIL'}; Detail=$detail } }

$exported = (rg -n "export \* from './env\.js'" "packages/service-utils/src/index.ts")
$usageRaw = rg -n "requireEnv\(" services/*/src/index.ts --count
$usageCount = 0
$usageRaw -split "`n" | ForEach-Object { if ($_ -match ":(\d+)$") { $usageCount += [int]$Matches[1] } }
Add-Result "requireEnv exported+used>=5" (($exported) -and ($usageCount -ge 5)) "uses=$usageCount"

$dockerCount = @(rg -n "^" services/*/Dockerfile --files-with-matches).Count
Add-Result "Dockerfiles count>=24" ($dockerCount -ge 24) "found=$dockerCount"

$standalone = rg -n "output:\s*'standalone'" "apps/web/next.config.mjs"
Add-Result "web standalone output" [bool]$standalone ""

$nginxRoutes = rg -n "location /api/(crm|finance|workflow|analytics|storage|billing|integration|blueprint|approval|data|document|chatbot|cadence|territory|planning|reporting|portal|knowledge|incentive)/" "infrastructure/nginx/nginx.conf"
Add-Result "nginx service routes" [bool]$nginxRoutes ""

$ciJobs = rg -n "lint-and-typecheck:|test:|build:" ".github/workflows/ci.yml"
Add-Result "CI lint/test/build jobs" [bool]$ciJobs ""

$deploySsh = rg -n "appleboy/ssh-action" ".github/workflows/deploy.yml"
Add-Result "Deploy SSH step" [bool]$deploySsh ""

$promTargets = rg -n "knowledge-service:3023|incentive-service:3024|portal-service:3022|reporting-service:3021" "infrastructure/prometheus/prometheus.yml"
Add-Result "Prometheus includes full set" [bool]$promTargets ""

$grafana = (Test-Path "infrastructure/grafana/provisioning/datasources/prometheus.yml") -and (Test-Path "infrastructure/grafana/provisioning/dashboards/dashboard.yml")
Add-Result "Grafana provisioning files" $grafana ""

$envCount = @(rg -n "^PORT=" services/*/.env.example --files-with-matches).Count
$webEnv = Test-Path "apps/web/.env.example"
Add-Result ".env.example coverage" (($envCount -ge 24) -and $webEnv) "services=$envCount web=$webEnv"

$migrate = rg -n "crm-service|auth-service|finance-service|document-service" "scripts/migrate-all.sh"
Add-Result "migrate-all service list" [bool]$migrate ""

$makeTargets = rg -n "^dev:|^prod:|^build:|^test:|^lint:|^db-migrate:|^db-seed:|^certs:" "Makefile"
Add-Result "Makefile required targets" [bool]$makeTargets ""

$readme = rg -n "Quick Start \(Development\)|Architecture \(Services\)|Monitoring" "README.md"
Add-Result "README required sections" [bool]$readme ""

$security = rg -n "@fastify/helmet|securityPlugin" "packages/service-utils/src/security.ts"
Add-Result "Security plugin added" [bool]$security ""

$nginxCompose = rg -n "^\s+nginx:" "docker-compose.yml"
Add-Result "Nginx in docker-compose" [bool]$nginxCompose ""

$results | ForEach-Object { "{0}: {1} {2}" -f $_.Status, $_.Check, $_.Detail }
if ($results.Status -contains 'FAIL') { exit 1 }
