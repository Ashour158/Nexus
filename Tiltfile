# Nexus CRM — Tilt Local Development

load('ext://restart_process', 'docker_build_with_restart')
load('ext://syncback', 'syncback')

default_registry('localhost:5000')

# Infrastructure services
docker_compose([
  './docker-compose.yml',
])

# Resource groups
def services():
  return [
    'auth-service',
    'crm-service',
    'contacts-service',
    'deals-service',
    'notification-service',
    'analytics-service',
    'realtime-service',
    'web',
  ]

# Watch and rebuild services
for svc in services():
  local_resource(
    svc,
    cmd='cd services/{} && pnpm build'.format(svc) if svc != 'web' else 'cd apps/web && pnpm build',
    deps=['services/{}/src'.format(svc)] if svc != 'web' else ['apps/web/src'],
    labels=['services'],
  )

# Web app with hot reload
docker_build_with_restart(
  'nexus-crm/web',
  'apps/web',
  entrypoint=['pnpm', 'dev'],
  live_update=[
    sync('apps/web/src', '/app/src'),
    sync('apps/web/public', '/app/public'),
  ],
)

# Port forwards
k8s_resource('postgres', port_forwards='5432:5432')
k8s_resource('redis', port_forwards='6379:6379')
k8s_resource('kafka', port_forwards='9092:9092')
k8s_resource('grafana', port_forwards='3001:3000')
k8s_resource('prometheus', port_forwards='9090:9090')

# Tilt UI settings
update_settings(max_parallel_updates=6)
analytics_settings(enable=False)
