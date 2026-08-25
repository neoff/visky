# Visky API

Backend API для мобильного приложения Visky - музыкального плеера с контентом Frisky Radio из VK Music.

## 🚀 Текущий деплой

- **Environment**: Production
- **Namespace**: `frisky` (Kubernetes)
- **Version**: `1.1.1`
- **URL**: https://visky.envarg.com
- **Status**: ✅ Running

## 📦 Технологии

- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL + TypeORM
- **Authentication**: Custom VK OAuth emulation
- **Containerization**: Docker (multi-platform: linux/amd64, linux/arm64)
- **Orchestration**: Kubernetes + Helm + Helmfile
- **CI/CD**: GitHub Actions

## 🏗️ Архитектура

\`\`\`
visky-api (Express.js backend)
├── VK Music API Proxy
│   ├── Authentication (custom OAuth flow)
│   ├── Playlist management (Frisky Radio content)
│   └── Favorites handling
├── Static Web Pages
│   ├── Landing page (/)
│   ├── EULA (/eula)
│   └── Privacy Policy (/privacy)
└── Health Checks (/health)
\`\`\`

## 🛠️ Разработка

### Предварительные требования

- Node.js 20+
- PostgreSQL 14+
- Docker (опционально)

### Установка

\`\`\`bash
# Клонировать репозиторий
git clone https://github.com/neoff/visky-api.git
cd visky-api

# Установить зависимости
yarn install

# Настроить переменные окружения
cp .env.example .env
# Отредактировать .env с вашими настройками

# Запустить в режиме разработки
yarn dev
\`\`\`

### Доступные команды

\`\`\`bash
yarn dev              # Запуск в режиме разработки с hot-reload
yarn build            # Сборка production bundle
yarn test             # Запуск тестов
yarn generate         # Генерация OpenAPI типов
\`\`\`

## 🐳 Docker

### Локальная сборка

\`\`\`bash
# Сборка образа
docker build -t visky-api:local .

# Запуск контейнера
docker run -p 3000:3000 --env-file .env visky-api:local
\`\`\`

### Multi-platform сборка

\`\`\`bash
# Сборка для linux/amd64 и linux/arm64
docker buildx build \\
  --platform linux/amd64,linux/arm64 \\
  --tag varg/visky-api:latest \\
  --push .
\`\`\`

## ☸️ Kubernetes Deployment

### Быстрый старт

См. [Quick Start Guide](./.github/helm/QUICKSTART.md)

\`\`\`bash
# Деплой через Helm
helm upgrade --install visky-api .github/helm \\
  --namespace frisky \\
  --set image.tag=1.1.1

# Проверка статуса
kubectl get pods -n frisky -l app=visky-api
curl https://visky.envarg.com/health
\`\`\`

### Документация

- 📘 [Helm Chart README](./.github/helm/README.md) - полная документация по деплою
- 🚀 [Quick Start](./.github/helm/QUICKSTART.md) - быстрый старт
- 📝 [Migration Guide](./.github/helm/MIGRATION-FRISKY-NAMESPACE.md) - история миграции в namespace frisky

## 🔄 CI/CD

Автоматический пайплайн через GitHub Actions:

1. **Release** → создание версии с semantic versioning
2. **Build** → сборка multi-platform Docker образа
3. **Deploy** → деплой в Kubernetes namespace \`frisky\`

### Ручной запуск workflows

\`\`\`bash
# Создать новый релиз
gh workflow run release.yml --ref main

# Собрать Docker образ для конкретной версии
gh workflow run push.yml --ref main --field ref=1.1.1

# Задеплоить конкретную версию
gh workflow run deploy.yml --ref main --field ref=1.1.1
\`\`\`

## 📡 API Endpoints

### Public Endpoints

- \`GET /\` - Landing page
- \`GET /eula\` - End User License Agreement
- \`GET /privacy\` - Privacy Policy
- \`GET /health\` - Health check

### Auth Endpoints

- \`GET /auth/vk\` - VK OAuth authentication flow
- \`POST /auth/vk/callback\` - OAuth callback handler

### API Endpoints (требуют аутентификации)

#### Плейлисты
- \`GET /api/playlist/frisky\` - Получить плейлист Frisky Radio

#### Frisky Favorites (новые endpoints)
- `POST /api/playlist/frisky/create-favorites` - Создать Frisky-favorites плейлист и заполнить треками с "feelin_frisky" (возвращает 409 если уже существует)
- `PATCH /api/playlist/frisky/create-favorites` - Пересоздать Frisky-favorites плейлист (удаляет все треки и заполняет заново из favorites)
- `GET /api/playlist/frisky/favorites` - Получить треки из Frisky-favorites
- `PUT /api/playlist/frisky/favorites` - Добавить трек в Frisky-favorites (и в основное избранное)
- `DELETE /api/playlist/frisky/favorites/:id` - Удалить трек из избранного

Полная документация API: https://visky.envarg.com/v3/api-docs

## 📊 Мониторинг

\`\`\`bash
# Логи приложения
kubectl logs -n frisky -l app=visky-api -f

# Метрики ресурсов
kubectl top pod -n frisky -l app=visky-api

# Health check
curl https://visky.envarg.com/health

# Prometheus метрики
curl https://visky.envarg.com/prometheus
\`\`\`

## 🔧 Troubleshooting

### ImagePullBackOff

\`\`\`bash
# Проверить секрет
kubectl get secret regcred -n frisky

# Скопировать из default namespace
kubectl get secret regcred -n default -o yaml | \\
  sed 's/namespace: default/namespace: frisky/' | \\
  kubectl apply -f -
\`\`\`

### CrashLoopBackOff

\`\`\`bash
# Проверить логи
kubectl logs -n frisky -l app=visky-api --tail=100

# Проверить events
kubectl describe pod -n frisky -l app=visky-api
\`\`\`

Больше информации: [Helm Chart README](./.github/helm/README.md#troubleshooting)

## 📝 Лицензия

См. [LICENSE](./LICENSE)

## 👥 Contributing

Pull requests приветствуются! Для major изменений сначала откройте issue для обсуждения.

## 🔗 Связанные проекты

- [visky](../visky/) - React Native мобильное приложение (iOS/Android)

## 📞 Контакты

- **Issues**: https://github.com/neoff/visky-api/issues
- **Discussions**: https://github.com/neoff/visky-api/discussions

## 🔊 Cross-device playback (Connect)

Один аккаунт — одна сессия воспроизведения. Трек, запущенный на iPhone, продолжается
на Android с той же секунды; на исходном устройстве звук останавливается.

### Как устроено

```
устройство ──WSS──> visky-api ──> Kafka  visky.playback.state.v1  (compact, key=user_id)
                         │              visky.playback.events.v1  (retention 7d)
                         └──> Postgres  users / devices  (+ push token)
```

* **WSS `/api/player/ws`** — единственный канал команд устройствам. Авторизация теми же
  `x-auth-*` заголовками; токен один раз проверяется в VK (`users.get`) и кешируется.
* **Kafka** — хранилище состояния. Топик log-compacted и ключуется `user_id`, поэтому
  последний снимок на пользователя живёт вечно: реплика при старте перечитывает топик
  с начала и восстанавливает мир. Устройства с Kafka не разговаривают никогда.
* **Postgres** — долговечные идентичности: какому пользователю принадлежит устройство
  и чем его будить.
* **Silent push** (`services/wake.ts`) — только звонок в дверь: разбудить устройство,
  у которого умер сокет, чтобы оно переподключилось и само забрало состояние. Пуш не
  несёт состояния и не может начать воспроизведение (iOS не будит выгруженное
  приложение и не даёт стартовать аудио из фонового пуша).

Позиция хранится не как число, а как функция: `position_ms` — это позиция на момент
`updated_at_ms` (серверные часы). «Где сейчас» = `position_ms + (now - updated_at_ms)`
при `playing`. Устройство сикает туда, куда сказал сервер, поэтому расхождение часов
телефонов ни на что не влияет. `version` монотонна и решает конфликты: обновление со
старой версией отбрасывается.

### Эндпоинты

| | |
|---|---|
| `GET /api/player/state` | вся сессия + список устройств (холодный старт) |
| `PUT /api/player/state` | что играет это устройство (fallback для сокета) |
| `GET /api/player/devices` | список устройств |
| `POST /api/player/devices` | регистрация устройства + push token |
| `POST /api/player/transfer` | передать звук на другое устройство |
| `GET /api/player/track/:owner_id/:id` | пере-резолв трека (VK подписывает ссылку под сессию) |

### Переменные окружения

Всё опционально — без них API работает, просто состояние живёт в памяти процесса.

```bash
# Kafka (локально docker; в кластере ns default)
KAFKA_BROKERS=localhost:29092                       # кластер: kafka-kafka.default.svc.cluster.local:29092
KAFKA_STATE_TOPIC=visky.playback.state.v1
KAFKA_EVENTS_TOPIC=visky.playback.events.v1

# Postgres (users/devices)
DB_HOST=localhost                                   # кластер: postgres-postgres.database.svc.cluster.local
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=visky

# Silent push (Expo Push API)
PUSH_ENABLED=true
PUSH_MIN_INTERVAL_MS=20000                          # APNs троттлит фоновые пуши

# Локальная разработка: пропустить проверку токена в VK при апгрейде сокета
PLAYBACK_TRUST_HEADERS=true
```

Миграция создаётся автоматически при старте (`initDataSource` → `runMigrations`).
Базу нужно создать заранее: `CREATE DATABASE visky`.
