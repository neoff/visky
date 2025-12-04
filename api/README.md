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
- \`POST /api/playlist/frisky/create-favorites\` - Создать Frisky-favorites плейлист и заполнить треками с "feelin_frisky"
- \`GET /api/playlist/frisky/favorites\` - Получить треки из Frisky-favorites
- \`PUT /api/playlist/frisky/favorites\` - Добавить трек в Frisky-favorites (и в основное избранное)
- \`DELETE /api/playlist/frisky/favorites/:id\` - Удалить трек из избранного

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
