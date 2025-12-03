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

✅ **mini-n** - Выбрана (2 vCPU, ~980MB RAM, текущее использование: 58%)
✅ **micro-n** - Альтернатива (2 vCPU, ~980MB RAM, текущее использование: 62%)

**Почему mini-n:**
- Больше свободной памяти (~448MB vs ~380MB на момент выбора)
- Меньше загрузка CPU (2% vs 3%)
- Оптимальное соотношение ресурсов для visky-api

### Node Selector

Для деплоя на конкретную ноду, раскомментируйте соответствующий label в `values.yaml`:

```yaml
nodeSelector:
  kubernetes.io/hostname: mini-n  # Текущая конфигурация
  # или micro-n
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
# Для mini-n ноды (рекомендуется)
helm upgrade --install visky-api .github/helm \
  --set nodeSelector."kubernetes\.io/hostname"=mini-n

# Для micro-n ноды
helm upgrade --install visky-api .github/helm \
  --set nodeSelector."kubernetes\.io/hostname"=micro-n
```

### Анализ ресурсов нод

Выбор между mini-n и micro-n был сделан на основе анализа:

| Нода | CPU Allocatable | Memory Allocatable | CPU Usage | Memory Usage | Свободно RAM |
|------|----------------|-------------------|-----------|--------------|--------------|
| **mini-n** ✅ | 2 cores | 980 MB | 54m (2%) | 532Mi (55%) | ~448 MB |
| micro-n | 2 cores | 980 MB | 75m (3%) | 600Mi (62%) | ~380 MB |

**Результат:** Выбрана `mini-n` - больше свободных ресурсов.

### Мониторинг

Проверить статус деплоя:
```bash
kubectl rollout status deployment/visky-api -n default
kubectl get pods -n default -l app=visky-api -o wide
kubectl top pod -n default -l app=visky-api
kubectl describe pod -n default -l app=visky-api
```

Проверить на какой ноде запущен pod:
```bash
kubectl get pod -n default -l app=visky-api -o wide
# Ожидается: NODE = mini-n
```

Текущее использование ресурсов:
```bash
# Pod visky-api
kubectl top pod -n default -l app=visky-api
# Типично: CPU: 5-12m, Memory: 66-96Mi

# Нода mini-n
kubectl top node mini-n
# После деплоя: CPU: ~37m (1%), Memory: ~563Mi (58%)
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
