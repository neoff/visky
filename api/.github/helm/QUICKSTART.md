# Quick Start Guide - visky-api Deployment

Быстрое руководство по деплою visky-api в Kubernetes кластер.

## Текущая конфигурация

- **Namespace**: `frisky`
- **Version**: `1.1.1`
- **Docker Image**: `varg/visky-api:1.1.1` (multi-platform: linux/amd64, linux/arm64)
- **Node**: `mini-n` (amd64)
- **URL**: https://visky.envarg.com

## Предварительные требования

1. **Kubernetes cluster** с kubectl доступом
2. **Helm 3+** установлен
3. **Helmfile** установлен (опционально, для автоматизации)
4. **Docker Hub credentials** (для private repository)

## Быстрый деплой

### Вариант 1: Через Helm (рекомендуется для ручного деплоя)

```bash
# 1. Клонировать репозиторий
git clone https://github.com/neoff/visky-api.git
cd visky-api/.github/helm

# 2. Создать namespace (если не существует)
kubectl create namespace frisky

# 3. Создать secret для pull образов
kubectl create secret docker-registry regcred \
  --docker-username=<your-dockerhub-username> \
  --docker-password=<your-dockerhub-token> \
  --docker-email=<your-email> \
  --namespace=frisky

# 4. Деплой
helm upgrade --install visky-api . \
  --namespace frisky \
  --set image.repository=varg/visky-api \
  --set image.tag=1.1.1 \
  --set 'ingress.hosts[0].host=visky.envarg.com' \
  --set 'ingress.hosts[0].paths[0].path=/' \
  --set 'ingress.hosts[0].paths[0].pathType=Prefix' \
  --set 'ingress.tls[0].hosts[0]=visky.envarg.com' \
  --set 'ingress.tls[0].secretName=visky-api-tls'

# 5. Проверить статус
kubectl get pods -n frisky -l app=visky-api
```

### Вариант 2: Через Helmfile (рекомендуется для CI/CD)

```bash
# 1. Убедиться что helmfile установлен
helmfile --version

# 2. Деплой с переменными окружения
NAMESPACE=frisky REPO_NAME=visky-api helmfile \
  --file .github/helm/helmfile.yaml.gotmpl \
  --environment production \
  --set image.repository=varg/visky-api \
  --set image.tag=1.1.1 \
  --set 'ingress.hosts[0].host=visky.envarg.com' \
  --set 'ingress.tls[0].hosts[0]=visky.envarg.com' \
  apply
```

### Вариант 3: Через GitHub Actions (автоматический)

```bash
# Запустить деплой конкретной версии
gh workflow run deploy.yml --ref main --field ref=1.1.1

# Отследить выполнение
gh run watch
```

## Проверка работоспособности

### 1. Проверить pod

```bash
kubectl get pods -n frisky -l app=visky-api
# Ожидаемый результат:
# NAME                         READY   STATUS    RESTARTS   AGE
# visky-api-79bcdb9748-xxxxx   1/1     Running   0          1m
```

### 2. Проверить все ресурсы

```bash
kubectl get all -n frisky
```

### 3. Проверить health endpoint

```bash
# Через Ingress (публичный URL)
curl https://visky.envarg.com/health

# Ожидаемый ответ:
# {"status":"UP","components":{...}}
```

### 4. Проверить web страницы

```bash
curl -I https://visky.envarg.com/        # Landing page
curl -I https://visky.envarg.com/eula    # EULA
curl -I https://visky.envarg.com/privacy # Privacy Policy
# Все должны вернуть HTTP/2 200
```

## Обновление версии

### Через Helm

```bash
helm upgrade visky-api .github/helm \
  --namespace frisky \
  --set image.tag=1.2.0 \
  --reuse-values
```

### Через GitHub Actions

```bash
# 1. Создать новый релиз
gh workflow run release.yml --ref main

# 2. Автоматически соберется образ и задеплоится
# Или запустить деплой вручную:
gh workflow run deploy.yml --ref main --field ref=1.2.0
```

## Откат (Rollback)

```bash
# Откатить на предыдущую версию
helm rollback visky-api -n frisky

# Откатить на конкретную ревизию
helm history visky-api -n frisky
helm rollback visky-api 2 -n frisky
```

## Удаление

```bash
# Удалить deployment
helm uninstall visky-api -n frisky

# Удалить namespace (опционально)
kubectl delete namespace frisky
```

## Troubleshooting

### ImagePullBackOff

**Симптом**: Pod не может pull образ

**Решение**:
```bash
# 1. Проверить существование секрета
kubectl get secret regcred -n frisky

# 2. Если нет - создать или скопировать
kubectl get secret regcred -n default -o yaml | \
  sed 's/namespace: default/namespace: frisky/' | \
  kubectl apply -f -

# 3. Проверить архитектуру
kubectl get node <node-name> -o jsonpath='{.status.nodeInfo.architecture}'

# 4. Убедиться что образ multi-platform
docker manifest inspect varg/visky-api:1.1.1
```

### CrashLoopBackOff

**Симптом**: Pod постоянно перезапускается

**Решение**:
```bash
# 1. Проверить логи
kubectl logs -n frisky -l app=visky-api --tail=100

# 2. Проверить events
kubectl describe pod -n frisky -l app=visky-api

# 3. Проверить ресурсы
kubectl top pod -n frisky -l app=visky-api
kubectl top node mini-n
```

### Ingress не работает

**Симптом**: URL недоступен

**Решение**:
```bash
# 1. Проверить ingress
kubectl get ingress -n frisky
kubectl describe ingress visky-api -n frisky

# 2. Проверить сертификат
kubectl get certificate -n frisky
kubectl describe certificate visky-api-tls -n frisky

# 3. Проверить cert-manager
kubectl get pods -n cert-manager
kubectl logs -n cert-manager -l app=cert-manager
```

## Полезные команды

```bash
# Логи в реальном времени
kubectl logs -n frisky -l app=visky-api -f

# Port-forward для локального доступа
kubectl port-forward -n frisky svc/visky-api 3000:80
# Затем: curl http://localhost:3000/health

# Выполнить команду в контейнере
kubectl exec -it -n frisky deployment/visky-api -- sh

# Проверить использование ресурсов
kubectl top pod -n frisky -l app=visky-api
kubectl top node mini-n

# Масштабирование
kubectl scale deployment visky-api -n frisky --replicas=2
```

## Ссылки

- [Полная документация](./README.md)
- [История миграции в frisky namespace](./MIGRATION-FRISKY-NAMESPACE.md)
- [Helm Chart templates](./templates/)
- [Values configuration](./values.yaml)
