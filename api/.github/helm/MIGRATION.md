# Миграция visky-api на ноду mini-n

## Дата: 3 декабря 2025

## Цель миграции

Оптимизировать размещение сервиса visky-api на легковесную ноду с оптимальными ресурсами.

## Анализ доступных нод

### Кандидаты: micro-n vs mini-n

Обе ноды имеют одинаковые allocatable ресурсы:
- **CPU**: 2 cores
- **Memory**: ~980 MB (979728 Ki)

### Текущее использование ресурсов (до миграции)

| Нода | CPU Usage | CPU % | Memory Usage | Memory % | Свободно CPU | Свободно RAM |
|------|-----------|-------|--------------|----------|--------------|--------------|
| **mini-n** ✅ | 54m | 2% | 532Mi | 55% | ~1946m | ~448 MB |
| micro-n | 75m | 3% | 600Mi | 62% | ~1925m | ~380 MB |

### Решение

Выбрана **mini-n** по следующим причинам:
1. ✅ Больше свободной памяти: **448 MB** vs 380 MB
2. ✅ Меньше загрузка CPU: **2%** vs 3%
3. ✅ Меньше общее использование памяти: **55%** vs 62%
4. ✅ Оптимальное соотношение для легковесного Express.js API

## Требования visky-api

### Настроенные лимиты
```yaml
resources:
  limits:
    cpu: 500m      # Максимум 0.5 CPU core
    memory: 512Mi  # Максимум 512 MB
  requests:
    cpu: 100m      # Гарантировано 0.1 CPU core  
    memory: 128Mi  # Гарантировано 128 MB
```

### Фактическое использование
После миграции:
- **CPU**: 5m (0.005 CPU core) - в 100 раз меньше лимита
- **Memory**: 96Mi - в 5 раз меньше лимита

**Вывод**: Ресурсы используются с большим запасом, нода mini-n подходит идеально.

## Процесс миграции

### 1. Обновление nodeSelector

```bash
kubectl patch deployment visky-api -n default --type='json' -p='[
  {"op": "replace", "path": "/spec/template/spec/nodeSelector/kubernetes.io~1hostname", "value": "mini-n"}
]'
```

### 2. Применение изменений

Kubernetes автоматически:
1. Создал новый pod на ноде `mini-n`
2. Дождался готовности (readinessProbe прошел успешно)
3. Начал терминацию старого pod на `micro-s`
4. Завершил rolling update

**Время миграции**: ~45 секунд
- ContainerCreating: ~10 секунд
- Waiting for readinessProbe: ~35 секунд (initialDelaySeconds: 10s)
- Zero downtime благодаря rolling update

## Результат миграции

### Состояние pod

```
NAME                         READY   STATUS    RESTARTS   AGE   IP          NODE     
visky-api-7f9cd4558d-dpcxn   1/1     Running   0          105s  10.42.6.2   mini-n
```

### Использование ресурсов pod

```
CPU:    5m
Memory: 96Mi
```

### Использование ресурсов ноды mini-n (после миграции)

```
CPU:    37m (1%)
Memory: 563Mi (58%)
```

**Свободно на ноде:**
- CPU: ~1963m (~98% свободно)
- Memory: ~417Mi (~42% свободно)

### Health Check

```json
{
  "status": "UP",
  "components": {
    "diskSpace": {"status": "UP"},
    "ping": {"status": "UP"},
    "ssl": {"status": "UP"}
  }
}
```

✅ Сервис полностью функционален: https://visky.envarg.com/health

## Конфигурация

### Deployment
```yaml
spec:
  template:
    spec:
      nodeSelector:
        kubernetes.io/hostname: mini-n
      containers:
      - name: visky-api
        image: varg/visky-api:1.0.40
        resources:
          limits:
            cpu: 500m
            memory: 512Mi
          requests:
            cpu: 100m
            memory: 128Mi
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
```

### Helm Values
```yaml
nodeSelector:
  kubernetes.io/hostname: mini-n

resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 100m
    memory: 128Mi
```

## Мониторинг

### Команды для проверки

```bash
# Проверить расположение pod
kubectl get pod -n default -l app=visky-api -o wide

# Использование ресурсов pod
kubectl top pod -n default -l app=visky-api

# Использование ресурсов ноды
kubectl top node mini-n

# Health check
curl https://visky.envarg.com/health

# Логи
kubectl logs -n default -l app=visky-api --tail=100
```

### Метрики для наблюдения

1. **CPU Usage**: Должно быть < 100m в обычном режиме
2. **Memory Usage**: Должно быть < 200Mi в обычном режиме
3. **Response Time**: Health endpoint должен отвечать < 100ms
4. **Readiness/Liveness**: Не должно быть failures

## Откат (если потребуется)

Вернуться на micro-n:
```bash
kubectl patch deployment visky-api -n default --type='json' -p='[
  {"op": "replace", "path": "/spec/template/spec/nodeSelector/kubernetes.io~1hostname", "value": "micro-n"}
]'
```

Или любую другую ноду с достаточными ресурсами (main-n, mini, etc).

## Обновления в кодовой базе

Обновлены файлы:
- ✅ `.github/helm/values.yaml` - nodeSelector на mini-n
- ✅ `.github/helm/README.md` - документация с анализом
- ✅ `.github/helm/MIGRATION.md` - этот документ

## Заключение

✅ Миграция успешно завершена  
✅ Zero downtime  
✅ Сервис работает стабильно  
✅ Ресурсы используются оптимально  
✅ Нода mini-n имеет достаточно запаса для пиковых нагрузок  

**Рекомендация**: Оставить на mini-n, мониторить использование ресурсов.
