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

### Namespace Configuration

**Текущий namespace**: `frisky` (с декабря 2025)

Приложение может быть развернуто в любом namespace. Namespace настраивается динамически через переменную окружения `NAMESPACE` в helmfile:

```yaml
# helmfile.yaml.gotmpl
releases:
  - name: {{ env "REPO_NAME" }}
    namespace: {{ env "NAMESPACE" | default "default" }}
```

**Для деплоя в другой namespace:**
```bash
NAMESPACE=production REPO_NAME=visky-api helmfile apply
```

**GitHub Actions** использует namespace `frisky` (см. `.github/workflows/deploy.yml`).

### Multi-Platform Support

Docker образ поддерживает обе архитектуры:
- ✅ **linux/amd64** - Intel/AMD процессоры (большинство cloud нод)
- ✅ **linux/arm64** - ARM процессоры (Apple Silicon, AWS Graviton)

Это позволяет развертывать приложение на любых нодах кластера без ограничений по архитектуре.

**Сборка multi-platform образа** (выполняется автоматически в GitHub Actions):
```bash
docker buildx build \
  --platform linux/arm64,linux/amd64 \
  --tag varg/visky-api:1.1.1 \
  --push .
```

**Проверить доступные платформы:**
```bash
docker manifest inspect varg/visky-api:1.1.1 | jq -r '.manifests[] | .platform'
```

### Web Pages

Приложение также предоставляет статические web страницы:
- **Landing Page**: `https://visky.envarg.com/` - главная страница приложения
- **EULA**: `https://visky.envarg.com/eula` - End User License Agreement (требуется для App Store/Google Play)
- **Privacy Policy**: `https://visky.envarg.com/privacy` - политика конфиденциальности (GDPR/CCPA compliant)
- **Download Pages**: 
  - `https://visky.envarg.com/download/ios` - скачать для iOS (заглушка)
  - `https://visky.envarg.com/download/android` - скачать для Android (заглушка)

Подробнее см. `public/README.md` в репозитории.

### Развертывание

#### Автоматическое (через GitHub Actions)

Полностью автоматизированный CI/CD пайплайн:

1. **Release Workflow** (`release.yml`) - создает релиз с semantic versioning
2. **Push Workflow** (`push.yml`) - собирает multi-platform Docker образ
3. **Deploy Workflow** (`deploy.yml`) - разворачивает в Kubernetes через helmfile

**Триггеры:**
- Push в `main` → автоматический деплой latest версии
- Push в `release/X.Y` → автоматический patch release (X.Y.Z)
- Manual dispatch → деплой конкретной версии

**Пример ручного запуска:**
```bash
# Запустить деплой версии 1.1.1 в namespace frisky
gh workflow run deploy.yml --ref main --field ref=1.1.1

# Пересобрать Docker образ для версии 1.1.1
gh workflow run push.yml --ref main --field ref=1.1.1

# Создать новый релиз (minor)
gh workflow run release.yml --ref main
```

#### Ручное развертывание через Helmfile

```bash
# Деплой в namespace frisky (текущая конфигурация)
REPO_NAME=visky-api NAMESPACE=frisky helmfile --file .github/helm/helmfile.yaml.gotmpl \
  --environment production \
  --set image.repository=varg/visky-api \
  --set image.tag=1.1.1 \
  --set "ingress.hosts[0].host=visky.envarg.com" \
  --set "ingress.tls[0].hosts[0]=visky.envarg.com" \
  --set "ingress.tls[0].secretName=visky-api-tls" \
  apply

# Деплой в namespace default
REPO_NAME=visky-api NAMESPACE=default helmfile apply
```

#### Ручное развертывание через Helm

```bash
# Деплой в namespace frisky
helm upgrade --install visky-api .github/helm \
  --namespace frisky \
  --set image.repository=varg/visky-api \
  --set image.tag=1.1.1 \
  --set 'ingress.hosts[0].host=visky.envarg.com' \
  --set 'ingress.hosts[0].paths[0].path=/' \
  --set 'ingress.hosts[0].paths[0].pathType=Prefix' \
  --set 'ingress.tls[0].hosts[0]=visky.envarg.com' \
  --set 'ingress.tls[0].secretName=visky-api-tls'

# Деплой на конкретную ноду (mini-n)
helm upgrade --install visky-api .github/helm \
  --namespace frisky \
  --set nodeSelector."kubernetes\.io/hostname"=mini-n \
  --set image.tag=1.1.1
```

#### Первый деплой в новый namespace

При первом деплое в новый namespace нужно создать секрет для pull образов из Docker Hub:

```bash
# Скопировать секрет из другого namespace
kubectl get secret regcred -n default -o yaml | \
  sed 's/namespace: default/namespace: frisky/' | \
  kubectl apply -f -

# Или создать новый
kubectl create secret docker-registry regcred \
  --docker-username=<username> \
  --docker-password=<token> \
  --docker-email=<email> \
  --namespace=frisky
```

### Анализ ресурсов нод

Выбор между mini-n и micro-n был сделан на основе анализа:

| Нода | CPU Allocatable | Memory Allocatable | CPU Usage | Memory Usage | Свободно RAM |
|------|----------------|-------------------|-----------|--------------|--------------|
| **mini-n** ✅ | 2 cores | 980 MB | 54m (2%) | 532Mi (55%) | ~448 MB |
| micro-n | 2 cores | 980 MB | 75m (3%) | 600Mi (62%) | ~380 MB |

**Результат:** Выбрана `mini-n` - больше свободных ресурсов.

### Мониторинг

Проверить статус деплоя в namespace frisky:
```bash
kubectl rollout status deployment/visky-api -n frisky
kubectl get pods -n frisky -l app=visky-api -o wide
kubectl top pod -n frisky -l app=visky-api
kubectl describe pod -n frisky -l app=visky-api
```

Полный статус всех ресурсов:
```bash
kubectl get all -n frisky
kubectl get ingress -n frisky
```

Проверить на какой ноде запущен pod:
```bash
kubectl get pod -n frisky -l app=visky-api -o wide
# Ожидается: NODE = mini-n (amd64 архитектура)
```

Текущее использование ресурсов:
```bash
# Pod visky-api
kubectl top pod -n frisky -l app=visky-api
# Типично: CPU: 5-12m, Memory: 66-96Mi

# Нода mini-n
kubectl top node mini-n
# После деплоя: CPU: ~37m (1%), Memory: ~563Mi (58%)
```

Проверить health endpoint:
```bash
# Через Ingress (внешний доступ)
curl https://visky.envarg.com/health

# Через port-forward (прямое подключение)
kubectl port-forward -n frisky svc/visky-api 3000:80
curl http://localhost:3000/health
```

Проверить логи:
```bash
# Последние 100 строк
kubectl logs -n frisky -l app=visky-api --tail=100

# Follow logs в реальном времени
kubectl logs -n frisky -l app=visky-api -f
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

# Посмотреть events в namespace frisky
kubectl get events -n frisky --sort-by='.lastTimestamp' | tail -20

# Проверить pod scheduling
kubectl describe pod -n frisky -l app=visky-api | grep -A 10 "Events:"
```

**ImagePullBackOff - ошибка pull образа:**

Проблема может быть связана с:
1. **Отсутствием секрета regcred** в namespace
2. **Несовместимой архитектурой** образа и ноды

```bash
# Проверить секреты в namespace
kubectl get secrets -n frisky

# Проверить архитектуру ноды
kubectl get node mini-n -o jsonpath='{.status.nodeInfo.architecture}'

# Проверить доступные платформы в образе
docker manifest inspect varg/visky-api:1.1.1 | jq -r '.manifests[] | .platform'

# Проверить события пода
kubectl describe pod -n frisky -l app=visky-api | grep -A 20 "Events:"
```

**Решение для ImagePullBackOff:**
```bash
# 1. Скопировать секрет из default namespace
kubectl get secret regcred -n default -o yaml | \
  sed 's/namespace: default/namespace: frisky/' | \
  kubectl apply -f -

# 2. Убедиться что образ multi-platform (содержит нужную архитектуру)
# Пересобрать образ если нужно:
gh workflow run push.yml --ref main --field ref=1.1.1

# 3. Удалить проблемный pod для рестарта
kubectl delete pod -n frisky -l app=visky-api
```

**OOM (Out of Memory):**
Если pod убивается из-за превышения памяти, увеличьте лимиты в `values.yaml`:
```yaml
resources:
  limits:
    memory: 1Gi  # было 512Mi
```

**Проблемы с Ingress/SSL:**
```bash
# Проверить статус сертификата
kubectl get certificate -n frisky
kubectl describe certificate visky-api-tls -n frisky

# Проверить Ingress
kubectl describe ingress visky-api -n frisky

# Проверить cert-manager logs
kubectl logs -n cert-manager -l app=cert-manager
```

### История изменений

**Декабрь 2025 - Migration to frisky namespace:**
- ✅ Добавлена динамическая поддержка namespace в helmfile.yaml.gotmpl
- ✅ Обновлен deploy.yml workflow для деплоя в namespace frisky
- ✅ Добавлена multi-platform поддержка Docker образов (linux/amd64, linux/arm64)
- ✅ Исправлена проблема с ImagePullBackOff на amd64 нодах
- ✅ Создан секрет regcred в namespace frisky
- ✅ Успешный деплой версии 1.1.1 в namespace frisky

**Ноябрь 2025 - Web pages release:**
- ✅ Добавлены статические web страницы (landing, EULA, privacy policy)
- ✅ Настроен Express routing для web страниц
- ✅ Добавлены страницы в production Docker образ
