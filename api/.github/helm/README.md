# Visky-API Helm Chart

## Конфигурация для развертывания

### Требования к ресурсам

Приложение visky-api оптимизировано для работы на легковесных нодах Oracle Cloud:

**Настроенные лимиты ресурсов:**
- CPU Requests: `100m` (0.1 CPU core)
- CPU Limits: `500m` (0.5 CPU core)
- Memory Requests: `128Mi`
- Memory Limits: `512Mi`

### Совместимость с нодами

✅ **micro-s** - Рекомендуется (~1 vCPU, ~1GB RAM)
✅ **mini-s** - Полностью поддерживается (~1-2 vCPU, ~2-4GB RAM)

### Node Selector

Для деплоя на конкретную ноду, раскомментируйте соответствующий label в `values.yaml`:

```yaml
nodeSelector:
  node.kubernetes.io/instance-type: micro-s  # или mini-s
  # Или другой label, если используется в вашем кластере
```

**Проверить доступные labels на нодах:**
```bash
kubectl get nodes --show-labels
```

По умолчанию `nodeSelector: {}` - pod может разместиться на любой ноде.

### Health Checks

Приложение предоставляет health endpoint на `/health` для:
- **Liveness Probe**: проверяет, что приложение живо (каждые 10 сек, начиная с 30 сек)
- **Readiness Probe**: проверяет готовность принимать трафик (каждые 5 сек, начиная с 10 сек)

### Развертывание

#### Автоматическое (через GitHub Actions)
Пуш в ветку `main` автоматически запускает пайплайн:
1. Сборка Docker образа
2. Деплой через Helmfile

#### Ручное развертывание
```bash
# Установка через helmfile
REPO_NAME=visky-api helmfile --file .github/helm/helmfile.yaml.gotmpl \
  --environment production \
  --set image.repository=varg/visky-api \
  --set image.tag=latest \
  apply
```

#### Деплой на конкретную ноду
```bash
# Для micro-s ноды
helm upgrade --install visky-api .github/helm \
  --set nodeSelector."node\.kubernetes\.io/instance-type"=micro-s

# Для mini-s ноды
helm upgrade --install visky-api .github/helm \
  --set nodeSelector."node\.kubernetes\.io/instance-type"=mini-s
```

### Мониторинг

Проверить статус деплоя:
```bash
kubectl rollout status deployment/visky-api -n default
kubectl get pods -n default -l app=visky-api
kubectl top pod -n default -l app=visky-api
kubectl describe pod -n default -l app=visky-api
```

Проверить на какой ноде запущен pod:
```bash
kubectl get pod -n default -l app=visky-api -o wide
```

Проверить health endpoint:
```bash
kubectl port-forward -n default svc/visky-api 3000:80
curl http://localhost:3000/health
```

### Метрики Prometheus

Доступны на `/prometheus` endpoint:
```bash
curl https://visky.envarg.com/prometheus
```

### Оптимизация

Текущая конфигурация обеспечивает:
- ✅ Эффективное использование ресурсов micro-s нод
- ✅ Защиту от OOM (Out of Memory) через лимиты
- ✅ Гарантированные ресурсы через requests
- ✅ Автоматический перезапуск при превышении лимитов
- ✅ Health checks для liveness и readiness
- ✅ Graceful shutdown и rolling updates

### Troubleshooting

**Pod не запускается на нужной ноде:**
```bash
# Проверить labels нод
kubectl get nodes --show-labels | grep -i "micro\|mini"

# Посмотреть events
kubectl get events -n default --sort-by='.lastTimestamp'

# Проверить pod scheduling
kubectl describe pod -n default -l app=visky-api | grep -A 10 "Events:"
```

**OOM (Out of Memory):**
Если pod убивается из-за превышения памяти, увеличьте лимиты в `values.yaml`:
```yaml
resources:
  limits:
    memory: 1Gi  # было 512Mi
```
