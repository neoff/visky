# Migration to frisky Namespace

**Дата миграции**: 3 декабря 2025  
**Версия**: visky-api:1.1.1  
**Предыдущий namespace**: default  
**Новый namespace**: frisky

## Мотивация

Миграция в отдельный namespace `frisky` для:
- Изоляции приложения от других сервисов в `default` namespace
- Упрощения управления ресурсами и мониторинга
- Подготовки к multi-environment deployment (dev/staging/prod)

## Выполненные изменения

### 1. Helm Chart - Динамический Namespace

**Файл**: `.github/helm/helmfile.yaml.gotmpl`

**До:**
```yaml
releases:
  - name: {{ env "REPO_NAME" }}
    namespace: default
    chart: ./
```

**После:**
```yaml
releases:
  - name: {{ env "REPO_NAME" }}
    namespace: {{ env "NAMESPACE" | default "default" }}
    chart: ./
```

**Изменение**: Namespace теперь настраивается через переменную окружения `NAMESPACE`, с fallback на `default`.

### 2. GitHub Actions Deploy Workflow

**Файл**: `.github/workflows/deploy.yml`

**Изменения:**

1. **Secret для pull образов** - изменен namespace с `default` на `frisky`:
```yaml
kubectl create secret docker-registry regcred \
  --namespace=frisky  # было: default
```

2. **Helmfile deployment** - добавлена переменная `NAMESPACE=frisky`:
```bash
REPO_NAME=${REPO_NAME} NAMESPACE=frisky helmfile apply
```

3. **kubectl rollout status** - изменен namespace:
```bash
kubectl rollout status deployment/${REPO_NAME} --namespace=frisky --timeout=300s
```

### 3. Multi-Platform Docker Build

**Файл**: `.github/workflows/push.yml`

**Проблема**: Образ собирался только для `linux/arm64`, что приводило к ошибке `ImagePullBackOff` на amd64 нодах (mini-n).

**До:**
```yaml
docker buildx build \
  --platform linux/arm64 \
  --tag varg/visky-api:$TAG \
  --push .
```

**После:**
```yaml
docker buildx build \
  --platform linux/arm64,linux/amd64 \
  --tag varg/visky-api:$TAG \
  --push .
```

**Результат**: Образ теперь поддерживает обе архитектуры и может быть развернут на любых нодах.

### 4. Создание Секрета в Namespace Frisky

При первом деплое в новый namespace необходимо создать секрет для pull образов:

```bash
# Скопирован из default namespace
kubectl get secret regcred -n default -o yaml | \
  sed 's/namespace: default/namespace: frisky/' | \
  kubectl apply -f -
```

## Процесс миграции

### Шаг 1: Подготовка конфигурации
```bash
# 1. Обновлен helmfile.yaml.gotmpl
git checkout -b feat/deploy-to-frisky-namespace
# Изменен namespace на динамический

# 2. Обновлен deploy.yml
# Изменены все упоминания default на frisky

# 3. Создан PR и смержен в main
gh pr create --title "feat: Deploy to frisky namespace"
gh pr merge 159 --squash --delete-branch
```

### Шаг 2: Исправление multi-platform поддержки
```bash
# 1. Обнаружена проблема с архитектурой
kubectl describe pod -n frisky -l app=visky-api
# Error: no match for platform in manifest: not found

# 2. Проверена архитектура ноды
kubectl get node mini-n -o jsonpath='{.status.nodeInfo.architecture}'
# amd64

# 3. Проверен образ
docker manifest inspect varg/visky-api:1.1.1
# Содержал только arm64

# 4. Исправлен push.yml - добавлен linux/amd64
git add .github/workflows/push.yml
git commit -m "fix: Add amd64 platform support to Docker build"
git push

# 5. Пересобран образ
gh workflow run push.yml --ref main --field ref=1.1.1
```

### Шаг 3: Создание секрета
```bash
# Скопирован regcred из default в frisky namespace
kubectl get secret regcred -n default -o yaml | \
  sed 's/namespace: default/namespace: frisky/' | \
  kubectl apply -f -
```

### Шаг 4: Деплой
```bash
# Ручной деплой через Helm для проверки
cd .github/helm
helm upgrade --install visky-api . \
  --namespace frisky \
  --set image.repository=varg/visky-api \
  --set image.tag=1.1.1 \
  --set 'ingress.hosts[0].host=visky.envarg.com' \
  --set 'ingress.hosts[0].paths[0].path=/' \
  --set 'ingress.hosts[0].paths[0].pathType=Prefix' \
  --set 'ingress.tls[0].hosts[0]=visky.envarg.com' \
  --set 'ingress.tls[0].secretName=visky-api-tls'

# Проверка
kubectl get pods -n frisky
# NAME                         READY   STATUS    RESTARTS   AGE
# visky-api-79bcdb9748-z4nmj   1/1     Running   0          69s
```

## Проверка работоспособности

### Проверка ресурсов
```bash
kubectl get all -n frisky
# NAME                             READY   STATUS    RESTARTS   AGE
# pod/visky-api-79bcdb9748-z4nmj   1/1     Running   0          5m
#
# NAME                TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE
# service/visky-api   ClusterIP   10.43.122.15   <none>        80/TCP    23m
#
# NAME                        READY   UP-TO-DATE   AVAILABLE   AGE
# deployment.apps/visky-api   1/1     1            1           5m
```

### Проверка Ingress
```bash
kubectl get ingress -n frisky
# NAME        CLASS     HOSTS              ADDRESS         PORTS     AGE
# visky-api   traefik   visky.envarg.com   207.127.89.52   80, 443   23m
```

### Проверка доступности приложения
```bash
curl https://visky.envarg.com/health
# {"status":"UP",...}

curl -s -o /dev/null -w "HTTP %{http_code}\n" https://visky.envarg.com/
# HTTP 200

curl -s -o /dev/null -w "HTTP %{http_code}\n" https://visky.envarg.com/eula
# HTTP 200

curl -s -o /dev/null -w "HTTP %{http_code}\n" https://visky.envarg.com/privacy
# HTTP 200
```

### Проверка архитектуры образа
```bash
docker manifest inspect varg/visky-api:1.1.1 | jq -r '.manifests[] | .platform'
# {
#   "architecture": "arm64",
#   "os": "linux"
# }
# {
#   "architecture": "amd64",
#   "os": "linux"
# }
```

## Проблемы и решения

### Проблема 1: ImagePullBackOff на amd64 ноде

**Симптом:**
```
Failed to pull image "varg/visky-api:1.1.1": 
no match for platform in manifest: not found
```

**Причина**: Образ собирался только для `linux/arm64`, а нода `mini-n` использует `amd64`.

**Решение**: Добавлена поддержка `linux/amd64` в Docker build:
```yaml
--platform linux/arm64,linux/amd64
```

### Проблема 2: Отсутствие секрета regcred

**Симптом:**
```
Unable to retrieve some image pull secrets (regcred)
pull access denied, repository does not exist or may require authorization
```

**Причина**: Секрет `regcred` существовал только в namespace `default`.

**Решение**: Скопирован секрет в namespace `frisky`.

### Проблема 3: Timeout при деплое с --atomic

**Симптом:**
```
Error: release visky-api failed, and has been uninstalled due to atomic being set: 
context deadline exceeded
```

**Причина**: Pod не мог запуститься из-за ImagePullBackOff, превышен таймаут в 300 секунд.

**Решение**: 
1. Исправлена проблема с архитектурой образа
2. Создан секрет regcred
3. Повторный деплой успешен

## Откат (Rollback)

Если потребуется откатиться к namespace `default`:

### Через GitHub Actions
```bash
# 1. Изменить NAMESPACE в deploy.yml
sed -i 's/NAMESPACE=frisky/NAMESPACE=default/' .github/workflows/deploy.yml

# 2. Закоммитить и запушить
git commit -am "rollback: Deploy to default namespace"
git push

# 3. Запустить деплой
gh workflow run deploy.yml --ref main --field ref=1.1.1
```

### Через Helm
```bash
# Удалить из frisky
helm uninstall visky-api -n frisky

# Установить в default
helm upgrade --install visky-api .github/helm \
  --namespace default \
  --set image.tag=1.1.1
```

## Cleanup старого deployment из namespace default

**ВАЖНО**: После успешной миграции в `frisky` namespace необходимо удалить старый deployment из `default`, чтобы избежать:
- **Конфликта Ingress** - два Ingress на один hostname `visky.envarg.com` могут привести к непредсказуемой маршрутизации
- **Дублирования ресурсов** - два pod'а потребляют двойное количество CPU/Memory
- **Путаницы при отладке** - неясно какой экземпляр отвечает на запросы

### Проверка наличия старого deployment
```bash
# Проверить есть ли visky-api в default namespace
kubectl get all -n default -l app=visky-api

# Проверить Ingress конфликт
kubectl get ingress -A | grep visky-api
# Должно быть только одно в frisky, не два!
```

### Удаление через Helm
```bash
# Удалить Helm release из default namespace
helm uninstall visky-api --namespace default

# Проверить что удалился
helm list -A | grep visky-api
# Должен остаться только frisky
```

### Удаление через kubectl (альтернатива)
```bash
# Если Helm release не найден, удалить ресурсы напрямую
kubectl delete deployment visky-api -n default
kubectl delete service visky-api -n default
kubectl delete ingress visky-api -n default
```

### Проверка после удаления
```bash
# Убедиться что остался только frisky namespace
kubectl get all,ingress -A | grep visky-api

# Ожидаемый результат:
# frisky   pod/visky-api-79bcdb9748-z4nmj   1/1   Running   0   40m
# frisky   service/visky-api                ClusterIP   10.43.122.15   <none>   80/TCP   1h
# frisky   deployment.apps/visky-api        1/1     1            1           40m
# frisky   replicaset.apps/visky-api-79...  1         1         1       40m
# frisky   ingress.../visky-api             traefik   visky.envarg.com   207.127.89.52   80,443

# Проверить что API работает
curl https://visky.envarg.com/health | jq '.status'
# "UP"
```

**Статус**: ✅ Выполнено 3 декабря 2025 - старый deployment из `default` namespace удален через `helm uninstall`.

## Итоговый статус

✅ **Namespace**: frisky (old `default` deployment removed)  
✅ **Version**: 1.1.1  
✅ **Docker Image**: varg/visky-api:1.1.1 (multi-platform: linux/amd64, linux/arm64)  
✅ **Pod Status**: Running (1/1 Ready)  
✅ **Node**: mini-n (amd64)  
✅ **Ingress**: https://visky.envarg.com (Working, no conflicts)  
✅ **Health Check**: UP  
✅ **Web Pages**: All accessible (/, /eula, /privacy)  

## Дальнейшие шаги

- [ ] Обновить мониторинг дашборды (Grafana) для отслеживания namespace frisky
- [ ] Настроить alerting для namespace frisky
- [ ] Рассмотреть создание separate namespaces для dev/staging/production
- [ ] Документировать процесс создания новых namespaces
