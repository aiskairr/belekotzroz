# Промт для воспроизведения страницы «Расчет цен»

Скопируй текст ниже и передай AI-разработчику вместе с файлами:

- `public/price-formula.html`
- `public/price-formula.css`
- `public/price-formula.js`
- `public/crm-shell.css`
- `public/crm-shell.js`

---

## Готовый промт

Создай production-ready страницу CRM «Расчет цен» на чистом HTML, CSS и JavaScript
без frontend-фреймворка. Интерфейс на русском языке. Страница интегрируется с
МойСклад через собственный Node.js backend: токен МойСклад никогда не должен
попадать в браузер.

Визуальный стиль:

- светлая административная панель с фоном `#eef4f8`;
- белые карточки, граница `#d7e0ea`, скругление 8 px, мягкая тень;
- основной цвет `#176b52`, заголовки `#172033`;
- широкая таблица с горизонтальным скроллом и закрепленной темной шапкой;
- состояния строк: рассчитано — светло-желтое, пропущено — светло-красное;
- адаптивная верстка для планшета и мобильного;
- полная темная тема через `body[data-mode="dark"]`;
- общий CRM sidebar подключается отдельным `crm-shell.js/css`.

### 1. Авторизация и доступ

При открытии вызвать:

```js
initCrmShell({
  page: 'priceFormula',
  allowedRoles: ['admin', 'owner', 'accountant']
});
```

Backend должен дополнительно проверять право `priceFormula` на каждом API endpoint.
Frontend-проверка не считается защитой.

### 2. Состояние страницы

Используй единый объект:

```js
const state = {
  products: [],
  priceTypes: [],
  folders: [],
  selected: new Set(),
  calculated: new Map(),
  skipped: new Map(),
  page: 1,
  total: 0,
  loadingCatalog: false,
  loadGeneration: 0,
  supplyFilter: null,
  supplyName: '',
  productTemplates: new Map()
};
```

Назначение:

- `selected` — ID выбранных товаров;
- `calculated` — результат расчета по ID товара;
- `skipped` — причина, почему товар нельзя рассчитать;
- `loadGeneration` — защита от результатов устаревшей параллельной загрузки;
- `supplyFilter` — набор `href` товаров из выбранной приемки;
- `productTemplates` — назначенный конкретной строке шаблон.

Размер страницы таблицы — 100 товаров. Каталог загружать порциями по 500.

### 3. Загрузка каталога

Первый запрос:

```http
GET /api/accounting/prices?offset=0&limit=500
```

Ответ:

```json
{
  "products": [],
  "priceTypes": [],
  "folders": [],
  "offset": 0,
  "limit": 500,
  "total": 1350,
  "nextOffset": 500,
  "hasMore": true
}
```

Первая порция сразу отображается. Остальные порции загружаются в фоне:

```http
GET /api/accounting/prices?offset=500&limit=500&includePriceTypes=false
```

При слиянии устраняй дубликаты через `Map(product.id -> product)`. Показывай
прогресс «Загружено N из M». Новый ручной reload должен отменять влияние старой
загрузки через сравнение `loadGeneration`.

Структура товара:

```js
{
  id,
  href,
  name,
  code,
  article,
  archived,
  folder: { id, href, name, pathName, template },
  buyPrice: {
    value,
    currencyHref,
    currencyIsoCode,
    currencyName
  },
  minPrice: {
    value,
    currencyHref,
    currencyIsoCode,
    currencyName
  },
  prices: [{
    value,
    priceTypeHref,
    priceTypeName,
    currencyHref,
    currencyIsoCode,
    currencyName
  }]
}
```

Суммы МойСклад приходят в сотых долях валюты, поэтому backend преобразует их в
обычные значения делением на 100. При сохранении — умножает на 100 и округляет.

### 4. Блок шаблонов групп

Добавь:

- выбор группы/подгруппы;
- выбор сохраненного шаблона;
- название шаблона;
- кнопки «Сохранить в группу», «Скопировать в группу», «Удалить из группы»;
- текстовый статус.

Шаблон хранится в `description` группы товаров МойСклад в сериализованном
служебном блоке. Обычный текст описания группы нельзя уничтожать.

API:

```http
POST /api/accounting/price-formula/folder-template
Content-Type: application/json

{
  "folderHref": "https://api.moysklad.ru/.../productfolder/UUID",
  "template": {
    "name": "Встройка стандарт",
    "usdRate": 89,
    "tiers": [],
    "wholesaleTiers": [],
    "bank36": 10,
    "bank912": 20,
    "calculate36": true,
    "calculate912": true,
    "rounding": 10,
    "wholesaleRounding": 0.1
  }
}
```

Для удаления передать `"template": null`.

При выборе группы с шаблоном:

1. применить настройки шаблона;
2. выбрать товары группы и ее подгрупп;
3. автоматически рассчитать цены;
4. показать количество рассчитанных и пропущенных товаров.

Шаблон в строке товара разрешено применять только к товарам той же подгруппы.

### 5. Диапазоны наценок

Сделай два независимых набора диапазонов:

1. для минимальной цены;
2. для оптовой цены.

Строка диапазона:

```js
{
  from: 20,
  to: 40,
  amount: 1500,
  currency: 'kgs' // или 'usd'
}
```

Условие попадания: `buyPriceUsd >= from && buyPriceUsd < to`.

Пустое `from` трактуется как 0, пустое `to` — как Infinity. Невалидные строки,
диапазоны `to <= from` и отрицательные наценки игнорируются. Диапазоны сортируются
по `from`.

Начальные диапазоны:

```js
[
  { from: 20, to: 40, amount: 1500, currency: 'kgs' },
  { from: 40, to: 100, amount: 2000, currency: 'kgs' }
]
```

Если закупочная цена не попала в диапазон, товар не рассчитывать и записать
понятную причину в `skipped`.

### 6. Формула

Параметры:

- курс USD → KGS, по умолчанию 89;
- процент для цены 3–6, по умолчанию 10%;
- процент для цены 9–12, по умолчанию 20%;
- checkbox, считать ли 3–6 и 9–12;
- округление минимальной и банковских цен: 0 / 0.1 / 0.5 / 10 / 100 KGS;
- округление оптовой цены: 0 / 0.1 / 0.5 / 1 USD.

Определи валюту закупки по ISO-коду или названию. Поддерживай USD и KGS.
Неизвестную валюту пропускай.

Формулы:

```js
buyPriceUsd = buyCurrency === 'KGS'
  ? buyPrice / usdRate
  : buyPrice;

baseKgs = buyCurrency === 'KGS'
  ? buyPrice
  : buyPrice * usdRate;

minMarkupKgs = minTier.currency === 'USD'
  ? minTier.amount * usdRate
  : minTier.amount;

wholesaleMarkupUsd = wholesaleTier.currency === 'USD'
  ? wholesaleTier.amount
  : wholesaleTier.amount / usdRate;

minRaw = baseKgs + minMarkupKgs;
wholesaleRaw = buyPriceUsd + wholesaleMarkupUsd;

minPrice = roundBy(minRaw, roundingKgs);
wholesalePrice = roundBy(wholesaleRaw, wholesaleRoundingUsd);
price36 = calculate36
  ? roundBy(minPrice * (1 + bank36 / 100), roundingKgs)
  : null;
price912 = calculate912
  ? roundBy(minPrice * (1 + bank912 / 100), roundingKgs)
  : null;
```

Округление:

```js
function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function roundBy(value, step) {
  return Number(step) > 0
    ? roundMoney(Math.round(value / Number(step)) * Number(step))
    : value;
}
```

Результат по товару:

```js
{
  productId,
  wholesaleCurrencyHref,
  wholesalePrice,
  minPrice,
  price36,
  price912
}
```

Все цены не меньше нуля и в финале округляются до 2 знаков.

### 7. Фильтры и выбор товаров

Реализуй:

- поиск по названию, коду и артикулу без учета регистра;
- фильтр по группе вместе со всеми дочерними подгруппами;
- выбор всех товаров текущей страницы;
- выбор всех товаров активного фильтра;
- пагинацию;
- фильтр по приемке.

Для приемки запроси у пользователя номер или URL и вызови:

```http
GET /api/accounting/supply-products?query=...
```

В ответе использовать `products[].href`. Оставить в таблице и автоматически
выбрать только совпавшие товары.

### 8. Таблица

Колонки:

1. checkbox;
2. код;
3. наименование;
4. шаблон группы;
5. закупочная цена;
6. оптовая сейчас;
7. оптовая новая, USD;
8. минимальная сейчас;
9. минимальная новая;
10. 3–6 сейчас;
11. 3–6 новая;
12. 9–12 сейчас;
13. 9–12 новая.

Новые рассчитанные значения должны оставаться редактируемыми вручную. Ручное
редактирование добавляет товар в `selected`, обновляет `calculated` и удаляет
ошибку из `skipped`.

Над таблицей показать счетчики:

- загружено / всего;
- выбрано;
- рассчитано;
- пропущено.

### 9. Сохранение

Перед сохранением синхронизируй все видимые поля ввода с `state.calculated`.
Разрешай не более 200 товаров за один запрос. Покажи confirm с количеством и
названиями изменяемых типов цен.

```http
POST /api/accounting/prices/formula-update
Content-Type: application/json

{
  "priceType36Href": "...",
  "priceType912Href": "...",
  "priceTypeWholesaleHref": "...",
  "changes": [{
    "productId": "UUID",
    "wholesaleCurrencyHref": "...",
    "wholesalePrice": 35.5,
    "minPrice": 4200,
    "price36": 4620,
    "price912": 5040
  }]
}
```

Backend обязан:

- повторно валидировать UUID, типы цен, валюты и диапазон 0…1 000 000 000;
- обрабатывать максимум 200 изменений;
- обновлять товары с concurrency = 5;
- для каждого товара сначала загрузить актуальный объект из МойСклад;
- сохранить `minPrice` в KGS;
- добавить или заменить «Оптовую цену» в USD;
- добавить или заменить 3–6 и 9–12 в KGS, если значение не `null`;
- сохранить остальные `salePrices` товара;
- после PUT проверить, что МойСклад вернул ожидаемую оптовую цену;
- вернуть частичный результат, не отменяя успешные товары из-за одной ошибки;
- записать итог в журнал аудита.

Ответ:

```json
{
  "updated": 18,
  "failed": 2,
  "results": [
    { "productId": "...", "ok": true },
    { "productId": "...", "ok": false, "error": "Причина" }
  ]
}
```

После успешного запроса очистить расчет и заново загрузить каталог.

### 10. Локальные настройки

Храни настройки формы в `localStorage` по ключу `ordoPriceFormulaPageV2`.
Сохраняй курс, диапазоны, проценты, checkbox и оба вида округления. Любое изменение
формулы должно очистить старые рассчитанные значения, чтобы пользователь не
сохранил результат по устаревшим параметрам.

### 11. Безопасность и качество

- не вставлять пользовательский текст через HTML без `escapeHtml`;
- токен МойСклад хранить только в переменной окружения backend;
- проверять права на сервере;
- показывать ошибки API пользователю;
- кнопки блокировать на время запросов;
- не терять обычное описание группы при записи шаблона;
- не удалять другие типы цен товара при обновлении;
- поддержать частичный успех пакетного сохранения;
- интерфейс должен оставаться рабочим во время фоновой загрузки каталога.

Сначала выдай структуру файлов и API-контракты, затем полный код HTML, CSS,
frontend JavaScript и Node.js backend. Не используй заглушки, псевдокод и фразы
«реализуйте самостоятельно».

---

## Карта исходных файлов текущей реализации

- `public/price-formula.html` — полная разметка страницы.
- `public/price-formula.css` — стили страницы, адаптивность и dark mode.
- `public/price-formula.js` — состояние, загрузка, шаблоны, формулы, фильтры,
  редактирование и сохранение.
- `public/crm-shell.js` — сессия, разрешения и общий sidebar.
- `public/crm-shell.css` — стили общего CRM-каркаса.
- `server.js` — API МойСклад, серверная валидация, запись шаблонов и цен.

Ключевые backend-функции в `server.js`:

- `getAccountingPriceCatalog`;
- `getMoySkladProductFolders`;
- `updateAccountingFolderPriceTemplate`;
- `updateAccountingFormulaPrices`;
- `updateMoySkladProductFormulaPrices`;
- `upsertSalePrice`;
- `findKgsPriceCurrency`;
- `findUsdPriceCurrency`.
