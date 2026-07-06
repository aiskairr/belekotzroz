# Ordo WAHA Backend

Отдельный тестовый backend для отправки WhatsApp-сообщений через WAHA.

## Установка

```bash
cd waha-backend
cp .env.example .env
npm install
```

Отредактируй `.env`:

```env
PORT=3300
WAHA_URL=http://localhost:3001
WAHA_API_KEY=
WAHA_SESSION=default
CORS_ORIGIN=http://localhost:3000
BACKEND_API_KEY=change-me
SEND_DELAY_MS=5000
MAX_BATCH_SIZE=200
```

Запуск:

```bash
npm start
```

Проверка:

```bash
curl http://localhost:3300/health
```

## WAHA session

Сессия `WAHA_SESSION=default` должна быть запущена и авторизована через QR в WAHA.

Если WAHA запущена на `http://localhost:3000`, а CRM тоже использует `3000`, перенеси WAHA на `3001`, либо этот backend на другой порт.

## Подключение к CRM

Открой страницу `WhatsApp рассылка` в CRM. В блоке `WAHA backend` укажи:

- `Backend URL`: `http://localhost:3300`
- `API key`: значение `BACKEND_API_KEY` из `.env`
- `Dry-run`: оставь включенным для первой проверки

Кнопка `Проверить WAHA` проверяет backend и текущую WAHA-сессию. Кнопка `Отправить через WAHA` отправляет выбранную очередь в `/api/send-batch`.

## Отправить одно сообщение

```bash
curl -X POST http://localhost:3300/api/send-text \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: change-me" \
  -d '{
    "phone": "996700123456",
    "text": "Здравствуйте! Это тестовое сообщение."
  }'
```

## Отправить картинку по URL

```bash
curl -X POST http://localhost:3300/api/send-image \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: change-me" \
  -d '{
    "phone": "996700123456",
    "imageUrl": "https://example.com/image.jpg",
    "caption": "Новое фото товара"
  }'
```

## Пачка сообщений

Сначала тестируй с `"dryRun": true`.

```bash
curl -X POST http://localhost:3300/api/send-batch \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: change-me" \
  -d '{
    "dryRun": true,
    "recipients": [
      { "name": "Асан", "phone": "996700111222" },
      { "name": "Айгуль", "phone": "0700222333" }
    ],
    "videoLinks": [
      "https://www.youtube.com/watch?v=RFerMyAUPRg"
    ],
    "textTemplate": "Здравствуйте, {name}! Мы сняли новое видео:\n{videos}\nЕсли интересно, напишите нам."
  }'
```

Ответ вернет `job.id`.

Проверить job:

```bash
curl http://localhost:3300/api/jobs/JOB_ID \
  -H "X-Api-Key: change-me"
```

## Форматы получателя

Личный номер:

```json
{ "phone": "996700123456" }
```

Готовый WAHA chatId:

```json
{ "chatId": "996700123456@c.us" }
```

Группа, если ты знаешь chatId группы:

```json
{ "chatId": "120363000000000000@g.us" }
```

## Важные нюансы

- `BACKEND_API_KEY` защищает этот backend. Не оставляй пустым на сервере.
- `WAHA_API_KEY` должен совпадать с настройками WAHA, если в WAHA включена авторизация.
- Для рассылок ставь задержку `SEND_DELAY_MS`, например `5000-15000`.
- Сначала проверяй пачки через `dryRun: true`.
- История сейчас хранится в памяти процесса. Если нужен продакшен, следующим шагом добавь запись job/items в Supabase или PostgreSQL.
