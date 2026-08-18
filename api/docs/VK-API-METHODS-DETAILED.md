# VK Audio API - Complete Methods Reference

> **Detailed documentation for all VK Audio API methods with full parameters, request/response examples**

Эта документация содержит полное описание всех 21 официальных методов VK Audio API на основе архивов официальной документации ВКонтакте (декабрь 2016 - февраль 2017).

---

## Table of Contents

1. [Audio Object Structure](#audio-object-structure)
2. [Audio Genres](#audio-genres)
3. [Core Methods](#core-methods)
   - [audio.get](#audioget)
   - [audio.getById](#audiogetbyid)
   - [audio.search](#audiosearch)
   - [audio.add](#audioadd)
   - [audio.delete](#audiodelete)
4. [Album Management](#album-management)
   - [audio.getAlbums](#audiogetalbums)
   - [audio.addAlbum](#audioaddalbum)
   - [audio.editAlbum](#audioeditalbum)
   - [audio.deleteAlbum](#audiodeletealbum)
   - [audio.moveToAlbum](#audiomovetoalbum)
5. [Track Management](#track-management)
   - [audio.edit](#audioedit)
   - [audio.reorder](#audioreorder)
   - [audio.restore](#audiorestore)
   - [audio.getLyrics](#audiogetlyrics)
   - [audio.getCount](#audiogetcount)
6. [Upload](#upload)
   - [audio.getUploadServer](#audiogetuploadserver)
   - [audio.save](#audiosave)
7. [Discovery & Social](#discovery--social)
   - [audio.getRecommendations](#audiogetrecommendations)
   - [audio.getPopular](#audiogetpopular)
   - [audio.setBroadcast](#audiosetbroadcast)
   - [audio.getBroadcastList](#audiogetbroadcastlist)

---

## Audio Object Structure

Объект аудиозаписи содержит следующие поля:

### API Version 5.0+

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | positive number | Идентификатор аудиозаписи |
| `owner_id` | integer | Идентификатор владельца аудиозаписи |
| `artist` | string | Исполнитель |
| `title` | string | Название композиции |
| `duration` | positive number | Длительность аудиозаписи в секундах |
| `url` | string | Ссылка на MP3 файл |
| `lyrics_id` | positive number | Идентификатор текста аудиозаписи (если доступно) |
| `album_id` | positive number | Идентификатор альбома (если присвоен) |
| `genre_id` | positive number | Идентификатор жанра из списка |
| `date` | integer | Дата добавления (Unix timestamp) |

### API Version < 5.0

| Поле | Тип | Описание |
|------|-----|----------|
| `aid` | positive number | Идентификатор аудиозаписи |
| `owner_id` | integer | Идентификатор владельца аудиозаписи |
| `artist` | string | Исполнитель |
| `title` | string | Название композиции |
| `duration` | positive number | Длительность аудиозаписи в секундах |
| `url` | string | Ссылка на MP3 файл |
| `lyrics_id` | positive number | Идентификатор текста аудиозаписи (если доступно) |
| `album` | positive number | Идентификатор альбома (если присвоен) |
| `genre` | positive number | Идентификатор жанра из списка |

**⚠️ Важно**: Ссылки на MP3 файлы привязаны к IP-адресу и имеют ограниченное время жизни.

---

## Audio Genres

Список жанров для использования в параметре `genre_id`:

| ID | Название (EN) | Название (RU) |
|----|---------------|---------------|
| 1 | Rock | Рок |
| 2 | Pop | Поп |
| 3 | Rap & Hip-Hop | Рэп и Хип-Хоп |
| 4 | Easy Listening | Легкая музыка |
| 5 | Dance & House | Танцевальная |
| 6 | Instrumental | Инструментальная |
| 7 | Metal | Метал |
| 8 | Dubstep | Дабстеп |
| 9 | Jazz & Blues | Джаз и Блюз |
| 10 | Drum & Bass | Драм-н-бейс |
| 11 | Trance | Транс |
| 12 | Chanson | Шансон |
| 13 | Ethnic | Этническая |
| 14 | Acoustic & Vocal | Акустика |
| 15 | Reggae | Регги |
| 16 | Classical | Классическая |
| 17 | Indie Pop | Инди-поп |
| 18 | Other | Другое |
| 19 | Speech | Речь |
| 21 | Alternative | Альтернатива |
| 22 | Electropop & Disco | Электропоп и Диско |

---

## Core Methods

### audio.get

**Описание**: Возвращает список аудиозаписей пользователя или сообщества.

**Права доступа**: `audio`

**Параметры**:

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `owner_id` | integer | Нет | ID пользователя или сообщества. Для сообщества используйте отрицательное значение. По умолчанию - текущий пользователь |
| `album_id` | positive number | Нет | ID аудио альбома |
| `audio_ids` | list of positive numbers | Нет | IDs аудиозаписей для возврата (через запятую) |
| `need_user` | flag (0 или 1) | Нет | `1` - возвращать информацию о пользователях, загрузивших аудиофайлы |
| `offset` | positive number | Нет | Смещение для получения определенного подмножества аудиозаписей |
| `count` | positive number | Нет | Количество аудиозаписей для возврата |

**Возвращает**: Объект с полями:
- `count` (integer) - общее количество результатов
- `items` (array) - массив объектов [аудиозаписей](#audio-object-structure)

**Пример запроса**:
```
https://api.vk.com/method/audio.get?owner_id=-42311167&count=100&offset=0&v=5.131
```

**Пример ответа**:
```json
{
  "response": {
    "count": 250,
    "items": [
      {
        "id": 456239017,
        "owner_id": -42311167,
        "artist": "Artist Name",
        "title": "Track Title",
        "duration": 180,
        "url": "https://cs1-71v4.vk-cdn.net/...",
        "date": 1234567890,
        "album_id": 123456,
        "genre_id": 5
      }
    ]
  }
}
```

**Ошибки**:
- `19` - Content blocked (контент заблокирован)

**История версий**:
- `5.12` - Новые типы ошибок, новый параметр для пагинации `start_from` и возвращаемое поле `next_from`

---

### audio.getById

**Описание**: Возвращает информацию об аудиозаписях по их идентификаторам.

**Права доступа**: `audio`

**Параметры**:

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `audios` | list of strings | **Да** | Идентификаторы аудиозаписей в формате `{owner_id}_{audio_id}` (через запятую) |

**Возвращает**: Массив объектов [аудиозаписей](#audio-object-structure)

**Пример запроса**:
```
https://api.vk.com/method/audio.getById?audios=123456_789012,234567_890123&v=5.131
```

**Пример ответа**:
```json
{
  "response": [
    {
      "id": 789012,
      "owner_id": 123456,
      "artist": "Artist Name",
      "title": "Track Title",
      "duration": 210,
      "url": "https://cs1-71v4.vk-cdn.net/..."
    }
  ]
}
```

**⚠️ Важно**: Ссылки на аудиозаписи привязаны к IP-адресу.

---

### audio.search

**Описание**: Возвращает список аудиозаписей в соответствии с заданным критерием поиска.

**Права доступа**: `audio`

**Параметры**:

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `q` | string | Нет | Текст поискового запроса (например, "The Beatles") |
| `auto_complete` | flag (0 или 1) | Нет | `1` - исправлять возможные ошибки в поисковом запросе |
| `lyrics` | flag (0 или 1) | Нет | `1` - искать только среди аудиозаписей с текстами |
| `performer_only` | flag (0 или 1) | Нет | `1` - искать только по названию исполнителя |
| `sort` | integer | Нет | Вид сортировки: `0` - по дате добавления, `1` - по длительности, `2` - по популярности |
| `search_own` | flag (0 или 1) | Нет | `1` - искать среди собственных аудиозаписей пользователя |
| `offset` | positive number | Нет | Смещение (по умолчанию: 0) |
| `count` | positive number | Нет | Количество результатов (по умолчанию: 30, максимум: 300) |

**Возвращает**: Объект с полями:
- `count` (integer) - общее количество результатов
- `items` (array) - массив объектов [аудиозаписей](#audio-object-structure)

**Пример запроса**:
```
https://api.vk.com/method/audio.search?q=The Beatles&auto_complete=1&count=50&v=5.131
```

**Пример ответа**:
```json
{
  "response": {
    "count": 1523,
    "items": [
      {
        "id": 456239017,
        "owner_id": 123456,
        "artist": "The Beatles",
        "title": "Let It Be",
        "duration": 243,
        "url": "https://cs1-71v4.vk-cdn.net/..."
      }
    ]
  }
}
```

**⚠️ Важно**: 
- Даже при использовании параметра `offset` доступны только первые 1000 результатов
- Ссылки на MP3 файлы привязаны к IP-адресу

---

### audio.add

**Описание**: Копирует аудиозапись на страницу пользователя или сообщества.

**Права доступа**: `audio`

**Параметры**:

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `audio_id` | positive number | **Да** | ID аудиозаписи |
| `owner_id` | integer | **Да** | ID владельца аудиозаписи (отрицательное для сообщества) |
| `group_id` | positive number | Нет | ID сообщества (без минуса) при добавлении в сообщество |
| `album_id` | positive number | Нет | ID альбома |

**Возвращает**: ID созданной аудиозаписи (integer)

**Пример запроса**:
```
https://api.vk.com/method/audio.add?audio_id=456239017&owner_id=-42311167&v=5.131
```

**Пример ответа**:
```json
{
  "response": 789012
}
```

---

### audio.delete

**Описание**: Удаляет аудиозапись со страницы пользователя или сообщества.

**Права доступа**: `audio`

**Параметры**:

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `audio_id` | positive number | **Да** | ID аудиозаписи |
| `owner_id` | integer | **Да** | ID владельца аудиозаписи |

**Возвращает**: `1` при успешном выполнении

**Пример запроса**:
```
https://api.vk.com/method/audio.delete?audio_id=456239017&owner_id=123456&v=5.131
```

**Пример ответа**:
```json
{
  "response": 1
}
```

---

## Album Management

### audio.getAlbums

**Описание**: Возвращает список альбомов аудиозаписей пользователя или группы.

**Права доступа**: `audio`

**Параметры**:

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `owner_id` | integer | Нет | ID пользователя или сообщества. По умолчанию - текущий пользователь |
| `offset` | positive number | Нет | Смещение для выборки определенного подмножества альбомов |
| `count` | positive number | Нет | Количество альбомов (по умолчанию: 50, максимум: 100) |

**Возвращает**: Объект с полями:
- `count` (integer) - общее количество альбомов
- `items` (array) - массив объектов альбомов

**Структура объекта альбома**:
- `id` (integer) - ID альбома
- `owner_id` (integer) - ID владельца альбома
- `title` (string) - название альбома

**Пример запроса**:
```
https://api.vk.com/method/audio.getAlbums?owner_id=123456&count=10&v=5.131
```

**Пример ответа**:
```json
{
  "response": {
    "count": 5,
    "items": [
      {
        "id": 12345,
        "owner_id": 123456,
        "title": "My Favorite Tracks"
      }
    ]
  }
}
```

**История версий**:
- `5.9` - Поле `id` вместо `album_id`

---

### audio.addAlbum

**Описание**: Создает пустой альбом аудиозаписей.

**Права доступа**: `audio`

**Параметры**:

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `group_id` | positive number | Нет | ID сообщества (если альбом создается в сообществе) |
| `title` | string | **Да** | Название альбома |

**Возвращает**: ID созданного альбома (integer)

**Пример запроса**:
```
https://api.vk.com/method/audio.addAlbum?title=Rock Collection&v=5.131
```

**Пример ответа**:
```json
{
  "response": 12345
}
```

**Ошибки**:
- `302` - Albums number limit is reached (достигнут лимит количества альбомов)

---

### audio.editAlbum

**Описание**: Редактирует название альбома аудиозаписей.

**Права доступа**: `audio`

**Параметры**:

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `group_id` | positive number | Нет | ID сообщества, в котором находится альбом |
| `album_id` | positive number | **Да** | ID альбома |
| `title` | string | **Да** | Новое название альбома |

**Возвращает**: `1` при успешном выполнении

**Пример запроса**:
```
https://api.vk.com/method/audio.editAlbum?album_id=12345&title=Best Rock Ever&v=5.131
```

**Пример ответа**:
```json
{
  "response": 1
}
```

---

### audio.deleteAlbum

**Описание**: Удаляет альбом аудиозаписей.

**Права доступа**: `audio`

**Параметры**:

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `group_id` | positive number | Нет | ID сообщества, в котором находится альбом |
| `album_id` | positive number | **Да** | ID альбома |

**Возвращает**: `1` при успешном выполнении

**Пример запроса**:
```
https://api.vk.com/method/audio.deleteAlbum?album_id=12345&v=5.131
```

**Пример ответа**:
```json
{
  "response": 1
}
```

---

### audio.moveToAlbum

**Описание**: Перемещает аудиозаписи в альбом.

**Права доступа**: `audio`

**Параметры**:

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `group_id` | positive number | Нет | ID сообщества, где находятся аудиозаписи. По умолчанию - ID текущего пользователя |
| `album_id` | positive number | Нет | ID альбома, в который будут перемещены аудиозаписи |
| `audio_ids` | list of positive numbers | **Да** | IDs аудиозаписей для перемещения (через запятую) |

**Возвращает**: `1` при успешном выполнении

**⚠️ Важно**: Альбом может содержать до 1000 аудиозаписей.

**Пример запроса**:
```
https://api.vk.com/method/audio.moveToAlbum?album_id=12345&audio_ids=456239017,456239018&v=5.131
```

**Пример ответа**:
```json
{
  "response": 1
}
```

---

## Track Management

### audio.edit

**Описание**: Редактирует данные аудиозаписи на странице пользователя или сообщества.

**Права доступа**: `audio`

**Параметры**:

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `owner_id` | integer | **Да** | ID владельца аудиозаписи. Для сообщества используйте отрицательное значение (например, `-1` для club1) |
| `audio_id` | positive number | **Да** | ID аудиозаписи |
| `artist` | string | Нет | Новое название исполнителя |
| `title` | string | Нет | Новое название композиции |
| `text` | string | Нет | Новый текст аудиозаписи |
| `genre_id` | positive number | Нет | ID жанра из [списка жанров](#audio-genres) |
| `no_search` | flag (0 или 1) | Нет | `1` - скрывает аудиозапись из поиска по аудиозаписям |

**Возвращает**: 
- `lyrics_id` (integer) - ID текста, введенного пользователем
- `0` если текст не был введен

**Пример запроса**:
```
https://api.vk.com/method/audio.edit?owner_id=123456&audio_id=456239017&artist=New Artist&title=New Title&v=5.131
```

**Пример ответа**:
```json
{
  "response": 12345
}
```

---

### audio.reorder

**Описание**: Изменяет порядок аудиозаписи, перенося её между другими аудиозаписями.

**Права доступа**: `audio`

**Параметры**:

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `audio_id` | positive number | **Да** | ID аудиозаписи |
| `owner_id` | integer | Нет | ID владельца аудиозаписи. По умолчанию - текущий пользователь |
| `before` | integer | Нет | ID аудиозаписи, перед которой следует поместить аудиозапись |
| `after` | integer | Нет | ID аудиозаписи, после которой следует поместить аудиозапись |

**Возвращает**: `1` при успешном выполнении

**Пример запроса**:
```
https://api.vk.com/method/audio.reorder?audio_id=456239017&before=456239018&v=5.131
```

**Пример ответа**:
```json
{
  "response": 1
}
```

---

### audio.restore

**Описание**: Восстанавливает удаленную аудиозапись.

**Права доступа**: `audio`

**Параметры**:

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `audio_id` | positive number | **Да** | ID аудиозаписи |
| `owner_id` | integer | Нет | ID владельца аудиозаписи. По умолчанию - текущий пользователь |

**Возвращает**: Объект [аудиозаписи](#audio-object-structure)

**⚠️ Важно**: Если время хранения аудиозаписи истекло (обычно это 20 минут), сервер вернет ошибку 202 (Cache expired).

**Пример запроса**:
```
https://api.vk.com/method/audio.restore?audio_id=456239017&owner_id=123456&v=5.131
```

**Пример ответа**:
```json
{
  "response": {
    "id": 456239017,
    "owner_id": 123456,
    "artist": "Artist Name",
    "title": "Track Title",
    "duration": 180,
    "url": "https://cs1-71v4.vk-cdn.net/..."
  }
}
```

**Ошибки**:
- `202` - Cache expired (время хранения истекло)

---

### audio.getLyrics

**Описание**: Возвращает текст аудиозаписи.

**Права доступа**: `audio`

**Параметры**:

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `lyrics_id` | integer | **Да** | ID текста (можно получить через `audio.get`, `audio.getById` или `audio.search`) |

**Возвращает**: Объект с полями:
- `lyrics_id` (integer) - ID текста
- `text` (string) - текст песни

**⚠️ Важно**: В тексте используется `/n` в качестве переноса строки.

**Пример запроса**:
```
https://api.vk.com/method/audio.getLyrics?lyrics_id=12345&v=5.131
```

**Пример ответа**:
```json
{
  "response": {
    "lyrics_id": 12345,
    "text": "First line/nSecond line/nThird line"
  }
}
```

---

### audio.getCount

**Описание**: Возвращает общее количество аудиозаписей на странице пользователя или сообщества.

**Права доступа**: `audio`

**Параметры**:

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `owner_id` | integer | **Да** | ID пользователя или сообщества. По умолчанию - текущий пользователь |

**Возвращает**: Общее количество аудиозаписей (integer)

**Пример запроса**:
```
https://api.vk.com/method/audio.getCount?owner_id=123456&v=5.131
```

**Пример ответа**:
```json
{
  "response": 250
}
```

---

## Upload

### audio.getUploadServer

**Описание**: Возвращает адрес сервера для загрузки аудиозаписей.

**Права доступа**: `audio`

**Параметры**: Отсутствуют

**Возвращает**: Объект с полем `upload_url` (string) - адрес для загрузки файла

**Процесс загрузки аудиозаписи**:
1. Вызвать `audio.getUploadServer` для получения `upload_url`
2. Загрузить файл на `upload_url` методом POST (поле `file`)
3. Сервер вернет `server`, `audio`, `hash`
4. Вызвать `audio.save` с полученными параметрами

**Пример запроса**:
```
https://api.vk.com/method/audio.getUploadServer?v=5.131
```

**Пример ответа**:
```json
{
  "response": {
    "upload_url": "https://pu.vk.com/c123456/upload.php?act=..."
  }
}
```

---

### audio.save

**Описание**: Сохраняет аудиозапись после успешной загрузки.

**Права доступа**: `audio`

**Параметры**:

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `server` | integer | **Да** | Параметр, возвращаемый в результате загрузки файла |
| `audio` | string | **Да** | Параметр, возвращаемый в результате загрузки файла |
| `hash` | string | **Да** | Параметр, возвращаемый в результате загрузки файла |
| `artist` | string | Нет | Название исполнителя (автозаполнение из файла) |
| `title` | string | Нет | Название композиции (автозаполнение из файла) |

**Возвращает**: Объект [аудиозаписи](#audio-object-structure)

**Пример использования**:

**Шаг 1 - Получить URL для загрузки**:
```bash
curl "https://api.vk.com/method/audio.getUploadServer?access_token=TOKEN&v=5.131"
# Ответ: {"response":{"upload_url":"https://pu.vk.com/..."}}
```

**Шаг 2 - Загрузить файл**:
```bash
curl -F "file=@song.mp3" "https://pu.vk.com/c123456/upload.php?act=..."
# Ответ: {"server":123,"audio":"[...]","hash":"abc123"}
```

**Шаг 3 - Сохранить аудиозапись**:
```bash
curl "https://api.vk.com/method/audio.save?server=123&audio=[...]&hash=abc123&artist=Artist&title=Title&access_token=TOKEN&v=5.131"
```

**Пример ответа**:
```json
{
  "response": {
    "id": 456239017,
    "owner_id": 123456,
    "artist": "Artist Name",
    "title": "Track Title",
    "duration": 180,
    "url": "https://cs1-71v4.vk-cdn.net/..."
  }
}
```

---

## Discovery & Social

### audio.getRecommendations

**Описание**: Возвращает список рекомендованных аудиозаписей на основе плейлиста пользователя или конкретной аудиозаписи.

**Права доступа**: `audio`

**Параметры**:

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `target_audio` | string | Нет | Для рекомендаций на основе конкретной аудиозаписи. Формат: `{owner_id}_{audio_id}` |
| `user_id` | positive number | Нет | Для рекомендаций на основе плейлиста пользователя. По умолчанию - текущий пользователь |
| `offset` | positive number | Нет | Смещение для получения определенного подмножества |
| `count` | positive number | Нет | Количество аудиозаписей (по умолчанию: 100, максимум: 1000) |
| `shuffle` | flag (0 или 1) | Нет | `1` - перемешивать результаты |

**Возвращает**: Объект с полями:
- `count` (integer) - общее количество результатов
- `items` (array) - массив объектов [аудиозаписей](#audio-object-structure)

**Пример запроса**:
```
https://api.vk.com/method/audio.getRecommendations?count=20&shuffle=1&v=5.131
```

**Пример ответа**:
```json
{
  "response": {
    "count": 150,
    "items": [
      {
        "id": 456239017,
        "owner_id": 123456,
        "artist": "Similar Artist",
        "title": "Recommended Track",
        "duration": 200,
        "url": "https://cs1-71v4.vk-cdn.net/..."
      }
    ]
  }
}
```

**Ошибки**:
- `19` - Content blocked

**История версий**:
- `5.9` - Новый формат для `audio.getRecommendations`

---

### audio.getPopular

**Описание**: Возвращает список популярных аудиозаписей.

**Права доступа**: `audio`

**Параметры**:

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `only_eng` | flag (0 или 1) | Нет | `1` - возвращать только зарубежные аудиозаписи, `0` - все аудиозаписи |
| `genre_id` | positive number | Нет | ID жанра из [списка жанров](#audio-genres) |
| `offset` | positive number | Нет | Смещение |
| `count` | positive number | Нет | Количество аудиозаписей (по умолчанию: 100, максимум: 1000) |

**Возвращает**: Объект с полями:
- `count` (integer) - общее количество результатов
- `items` (array) - массив объектов [аудиозаписей](#audio-object-structure)

**Пример запроса**:
```
https://api.vk.com/method/audio.getPopular?only_eng=1&genre_id=1&count=50&v=5.131
```

**Пример ответа**:
```json
{
  "response": {
    "count": 100,
    "items": [
      {
        "id": 456239017,
        "owner_id": 123456,
        "artist": "Popular Artist",
        "title": "Hit Song",
        "duration": 195,
        "url": "https://cs1-71v4.vk-cdn.net/..."
      }
    ]
  }
}
```

**⚠️ Важно**: Ссылки на MP3 файлы привязаны к IP-адресу.

---

### audio.setBroadcast

**Описание**: Активирует аудиовещание в статус пользователя или сообщества.

**Права доступа**: `status`

**Параметры**:

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `audio` | string | Нет | ID аудиофайла для отображения в статусе (формат: `{owner_id}_{audio_id}`, например `1_190442705`). Если параметр не указан, аудиостатус будет удален |
| `target_ids` | list of integers | Нет | IDs сообществ и пользователя, в чьи статусы будет включено вещание. Для сообщества используйте отрицательное значение. По умолчанию - текущий пользователь. Максимум 20 элементов |

**Возвращает**: Новое значение настройки

**Пример запроса - Установить вещание**:
```
https://api.vk.com/method/audio.setBroadcast?audio=123456_789012&v=5.131
```

**Пример запроса - Удалить вещание**:
```
https://api.vk.com/method/audio.setBroadcast?v=5.131
```

**Пример ответа**:
```json
{
  "response": [123456]
}
```

**История версий**:
- `4.99` - Возможность транслировать аудио в статус пользователя или любой группы, которой администрирует текущий пользователь

---

### audio.getBroadcastList

**Описание**: Возвращает список друзей и сообществ пользователя, которые транслируют музыку в статус.

**Права доступа**: Не требуются

**Параметры**:

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `filter` | string | Нет | Типы объектов для получения: `friends` - только друзья, `groups` - только сообщества, `all` - друзья и сообщества. По умолчанию: `all` |
| `active` | flag (0 или 1) | Нет | `1` - возвращать только друзей и сообщества, транслирующие музыку в данный момент. По умолчанию: все |

**Возвращает**: Список объектов друзей и сообществ с дополнительным полем `status_audio` - объект [аудиозаписи](#audio-object-structure), установленной в статус (если аудиозапись транслируется в текущий момент)

**Пример запроса**:
```
https://api.vk.com/method/audio.getBroadcastList?filter=friends&active=1&v=5.131
```

**Пример ответа**:
```json
{
  "response": [
    {
      "id": 234567,
      "first_name": "John",
      "last_name": "Doe",
      "status_audio": {
        "id": 456239017,
        "owner_id": 234567,
        "artist": "Current Artist",
        "title": "Playing Now",
        "duration": 210
      }
    }
  ]
}
```

---

## Приложения

### Коды ошибок

Помимо указанных выше ошибок, могут возникать общие ошибки VK API. Их описание доступно на странице [https://vk.com/dev/errors](https://vk.com/dev/errors).

**Основные коды ошибок**:
- `5` - User authorization failed (пользователь не авторизован)
- `6` - Too many requests per second (слишком много запросов)
- `9` - Flood control (flood control)
- `10` - Internal server error (внутренняя ошибка сервера)
- `14` - Captcha needed (требуется ввод капчи)
- `15` - Access denied (доступ запрещен)
- `19` - Content blocked (контент заблокирован)
- `100` - One of the parameters specified was missing or invalid (неверный параметр)
- `113` - Invalid user id (неверный ID пользователя)
- `201` - Permission denied (нет прав доступа)
- `202` - Cache expired (кеш истек)
- `302` - Albums number limit is reached (достигнут лимит альбомов)

### Важные замечания

1. **IP-привязка URL**: Все ссылки на MP3 файлы привязаны к IP-адресу клиента и имеют ограниченное время жизни
2. **Лимиты**:
   - Максимум 1000 аудиозаписей в альбоме
   - Максимум 1000 результатов поиска (даже с offset)
   - Максимум 6000 аудиозаписей при вызове `audio.get`
3. **Права доступа**: Большинство методов требуют `audio` scope, кроме:
   - `audio.getBroadcastList` - не требует
   - `audio.setBroadcast` - требует `status`
4. **Время хранения**: Удаленные аудиозаписи хранятся ~20 минут, после чего их нельзя восстановить

---

## Changelog

- **2024-12-04**: Создание полной детальной документации на основе архивов VK API (Dec 2016 - Feb 2017)

---

## References

- VK Audio API Archive (Dec 16, 2016): https://web.archive.org/web/20161216124951/https://vk.com/dev/audio
- VK Audio API Archive (Feb 5, 2017): https://web.archive.org/web/20170205141608/https://vk.com/dev/audio
- VK Audio Genres: https://web.archive.org/web/20161216124951/https://vk.com/dev/audio_genres
- VK Audio Object: https://web.archive.org/web/20161216124951/https://vk.com/dev/audio_object
