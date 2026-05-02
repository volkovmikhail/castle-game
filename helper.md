# Руководство по стилю кода (castle-game)

Документ для людей и для ИИ-ассистентов: как писать код, чтобы он совпадал с этим репозиторием.

## Стек и запуск

- **Клиент**: чистый JavaScript (ES modules), Canvas 2D, без сборщика в репозитории. Статика отдаётся Express из папки `client/`.
- **Сервер**: `server/app.js` — CommonJS (`require`/`module.exports`), только раздача статики.
- Запуск: `npm start` → `http://localhost:3000`.

Импорты в клиентских модулях **всегда с расширением** `.js`.

## Структура папок

| Путь | Назначение |
|------|------------|
| `client/constants/` | Конфигурация без логики: тайлы (`tiles.js`), цвета, размеры, тулбар зданий, отображение канваса (`canvas-display.js`) |
| `client/engine/` | Движок: рендер, ввод, игровой цикл, спрайты, состояние клеток |
| `client/game/` | Игровая логика: `Game`, генераторы, сущности, атмосфера (снег, флаги) |
| `client/ui/` | DOM/UI поверх игры |
| `server/` | Минимальный HTTP-сервер |
| `arts/` | Информационная папка с исходниками/данными артов; это не кодовый модуль и ничего из неё не импортируется |

Новый код кладите в слой, который логически отвечает за задачу: константы не смешивать с отрисовкой, чистую математику — в `common/` при необходимости.

## Именование

- **Файлы**: `kebab-case.js` (`state-manager.js`, `sprite-post-draw-registry.js`).
- **Классы**: `PascalCase` (`CanvasRenderer`, `StateManager`).
- **Функции и переменные**: `camelCase`.
- **Константы верхнего уровня**: `UPPER_SNAKE` или `camelCase` для объектов-конфигов — как уже принято в соседних файлах той же папки.
- Ключи клеток в `Map`: строка `"x:y"` в пикселях/тайлах согласно существующему коду (`StateManager`).

## Модули и зависимости

```javascript
import { TILE_SIZE } from '../../constants/sizes.js';
import { Cell } from './cell.js';
```

- Относительные пути; расширение `.js` обязательно.
- Экспорт: именованный `export function` / `export class` / `export const`, без «баррельных» `index.js`, если их ещё нет в проекте.

## JSDoc и типы

Проект без TypeScript; типы задаются через **JSDoc**:

- `@typedef` для форм данных (например `TileData` в `sprite.js`).
- `@param` с фигурными объектами для опций: `@param {{ x: number; y: number }} options`.
- `@returns` для возвращаемых значений.
- Связь с классом из другого файла: `@typedef {import('./sprite.js').Sprite} Sprite`.

Комментарии к публичным методам и нетривиальной логике приветствуются. В проекте встречаются комментарии на **русском** (доменные пояснения) и на английском — допустимо смешение, главное — ясность в изменяемом файле.

## Паттерны кода

### Конструктор с объектом опций

```javascript
export class Example {
  /**
   * @param {{ renderer: CanvasRenderer; stateManager: StateManager }} options
   */
  constructor({ renderer, stateManager }) {
    this.renderer = renderer;
    this.stateManager = stateManager;
  }
}
```

### Игровой цикл

- `GameLoop` вызывает `game.update(timeStep)` и `game.render()`; фиксированный шаг `timeStep` (см. `game-loop.js`).
- В `update` — логика и ввод; в `render` — только отрисовка.

### Состояние сетки

- `StateManager` хранит `Map` клеток; для много-тайловых зданий заполняются несколько ключей, `isRenderable` только у одной «якорной» клетки.
- При добавлении нового типа тайла сначала опишите его в `client/constants/tiles.js`, затем используйте `type` в логике.

### Спрайты и пост-эффекты

- `Sprite` получает `tileData` из `tiles`.
- Доп. отрисовка по типу тайла: `registerSpritePostDraw(tileType, fn)` в `sprite-post-draw-registry.js`, модуль с регистрацией можно **импортировать за побочный эффект** из `game.js` (как `castle-flags.js`).

### Расширение без правок ядра

Предпочтительно: отдельный модуль, который при загрузке регистрирует обработчики / подключается из `Game`, а не раздувание одного гигантского файла.

### Точка входа (`client/main.js`)

- Держите файл **коротким**: только загрузка ассетов, создание `Renderer` / `Controls` / `Game` / `GameLoop`, вызов `init` и `start`.
- Логику привязки канваса к DOM и ресайза не кладите в `main.js` — используйте `client/ui/canvas-resize.js` (`syncCanvasSize`, `attachCanvasResize`).

### Канвас: внутреннее разрешение и масштаб пикселей

- **Внутренние** `canvas.width` / `canvas.height` — это размер буфера в игровых пикселях (как у `CanvasRenderer.getRendererSize()`, генераторов, снега).
- **Масштаб отображения** задаётся константой **`CANVAS_PIXEL_SCALE`** в `client/constants/canvas-display.js`: целое ≥ 1. Один пиксель буфера рисуется как блок N×N CSS-пикселей в `.canvas-stage` (через `canvas.style.width` / `height`), чтобы пиксель-арт оставался чётким.
- При смене размера окна/stage вызывается `Game.resizeViewport()` (пересборка мира под новый буфер); обвязка — в `canvas-resize.js`, не дублировать копипастой в `main.js`.
- Ввод мыши уже учитывает несовпадение буфера и CSS-размера (`Controls`: масштаб через `getBoundingClientRect` и `canvas.width` / `canvas.height`).
- Не присваивайте `canvas.width` / `canvas.height` повторно без необходимости: в браузерах это сбрасывает буфер. Меняйте размер буфера только когда вычисленные внутренние размеры реально изменились (как в `syncCanvasSize`).

## Стиль форматирования

- Точки с запятой в конце операторов — как в существующих файлах.
- 2 пробела для отступов.
- Опциональные цепочки: `this.snow?.update(timeStep)` где уместно.
- Приватные поля класса: синтаксис `#field`, если нужна инкапсуляция (как в `StateManager`).

## Сервер vs клиент

- **Клиент**: только ESM (`import`/`export`).
- **Сервер**: CommonJS. Не подключайте клиентские модули в `server/` без отдельной договорённости и сборки.

## Чего избегать

- Не вводить сборщик, TypeScript или новые зависимости без явной необходимости и согласования с владельцем репозитория.
- Не оставлять отладочный `console.log` в финальном коммите без причины.
- Не смешивать координаты «тайл сетки» и «пиксели экрана» без явных имён (`tx`/`ty`, `x`/`y`, `offsetX` и т.д.).
- Не раздувать `main.js` вспомогательной логикой (ресайз канваса, debounce, вычисление размеров) — выносите в `client/ui/` или `client/engine/` по смыслу и подключайте одним-двумя вызовами.

## Шаблон: новый класс в `client/game/`

```javascript
import { tiles } from '../constants/tiles.js';

export class FeatureName {
  /**
   * @param {{ stateManager: import('../engine/state/state-manager.js').StateManager }} options
   */
  constructor({ stateManager }) {
    this.stateManager = stateManager;
  }

  init() {
    // однократная настройка
  }

  /**
   * @param {number} timeStep
   */
  update(timeStep) {
    // логика кадра
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    // только рисование
  }
}
```

Подключение: создать экземпляр в `Game` (в `init` или конструкторе), вызывать `update`/`render` из `Game.update` / `Game.render` в нужном порядке.

## Шаблон: константа тайла

В `client/constants/tiles.js` добавьте ключ с тем же `type`, что и ключ (или осознанно иначе, но тогда везде один стиль), поля `mapX`, `mapY`, `width`, `height` — регион в `assets/tilemap.png`.

## Шаблон: пост-отрисовка для типа тайла

```javascript
import { registerSpritePostDraw } from '../../engine/sprite-post-draw-registry.js';

registerSpritePostDraw('myTileType', (sprite, ctx, tileMap, timeMs) => {
  const { x, y } = sprite.getPos();
  // ctx.drawImage(tileMap, ...)
});
```

Импорт этого файла из `game.js` (или другого гарантированно загружаемого места), чтобы регистрация выполнилась до кадра.

## Шаблон: чистая функция с JSDoc

```javascript
/**
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function add(a, b) {
  return a + b;
}
```

---

При сомнениях смотрите соседние файлы в той же папке и повторяйте их стиль импортов, JSDoc и структуры классов.

## Модули рыцарей

Описание основных модулей и сущностей, связанных с рыцарями.

- `client/game/knights/knight-system.js`  
  Главная игровая система рыцарей (`KnightSystem`): спавн, выделение (клик и рамка `selectUnitsInWorldRect`), выдача приказов, обновление состояний (`idle` / `move` / `chop`), путь до цели, коллизии между юнитами и с препятствиями, а также отрисовка спрайта и рамки выделения.

- `client/engine/controls.js` (фрагмент ввода для рыцарей)  
  ЛКМ **без Shift** — перетаскивание панорамирует камеру (как раньше). ЛКМ **с Shift** — перетаскивание задаёт рамку выделения в мире: `getMarqueeDraftWorldRect()` для превью в `Game.render`, `consumeMarqueeSelectionWorldRect()` в `Game.update` отдаёт итоговый прямоугольник после отпускания кнопки (порог ~4px в мире, чтобы отличить от клика).

- `client/common/grid-path.js`  
  Общие функции навигации по сетке: проверка проходимости тайлов, A* (`findPathTiles`), проверка прямой видимости/проходимости (`hasStraightWalk`), утилиты для работы с деревьями (`isTreeSpriteType`, `neighborStandTilesForTree`, `neighborStandTiles8ForTree`).

- `client/constants/knight-atlas.js`  
  Константы визуала рыцаря: размер спрайта, набор кадров для бега/рубки/покоя, тайминги анимации и радиус коллизии между рыцарями (`KNIGHT_COLLISION_RADIUS`).

- Сущность `KnightUnit` (внутри `knight-system.js`)  
  Модель одного рыцаря: мировая позиция, режим, текущий маршрут, пиксельная цель, цель рубки, анимационные таймеры и направление отображения (`faceLeft`).

---

## Игровой контент

Экономика (три ресурса), постройки и найм с панели, ферма со стадиями роста и сбором урожая, магазин с постройкой и обменом валют, рыцари и доход дерева за рубку, периодическая регенерация леса вплотную к существующим деревьям.

### Ресурсы игрока

- Тип `PlayerResources`: **пшеница**, **дерево**, **золото** (`client/constants/resources.js`).
- Стартовые значения задаются в `STARTING_PLAYER_RESOURCES`; при каждой пересборке мира (`Game.#setupWorld`) для каждого профиля из `PLAYER_PROFILES` создаётся копия через `cloneStartingResources()`.
- UI ресурсов обновляется через `UI.setResources()` (локальный игрок).

### Экономика построек и найма

- Файл `client/constants/economy.js`: таблица `PLACEMENT_COSTS` по ключу инструмента из панели (`farmStage1`, `market`, `knight`).
- Вспомогательные функции: `canAfford`, `subtractResources`, `getNumericCost`, `formatCostLineForTool`.
- У записи магазина флаг **`uniquePerPlayer`**: у одного игрока не может быть двух магазинов (проверка в `Game.#tryUniquePlacementRule` и `#playerHasAnyMarket`).
- Рыцарь в панели — псевдо-ключ `KNIGHT_TOOL_KEY` (`'knight'`): для спрайта используется отдельная текстура, не тайл из `tiles.js`.

### Панель построек

- `client/constants/buildings-toolbar.js` — список кнопок: ферма (`farmStage1`, превью `farmStage4`), магазин (`market`), рыцарь (`externalSprite`).
- Размещение зданий и найм рыцаря обрабатываются в `Game.update` по клику ЛКМ (не Shift).

### Правила размещения (`Game.#validatePlacement`)

- Только внутри прямоугольника мира (`WORLD_WIDTH_PX` / `WORLD_HEIGHT_PX` из `client/constants/world.js`).
- Нельзя ставить поверх занятой клетки; деревья нужно сначала срубить (сообщение про расчистку).
- Любая постройка должна быть в радиусе **не более 2 клеток** (Chebyshev) от **любой своей** клетки игрока (`MAX_BUILD_DISTANCE_CELLS`) — «привязка» к своей территории.
- Для типов «дом» (`castle`, `house*`, `farmStage*`, `houseFarm`) дополнительно: в радиусе **3 клеток** должен быть **ещё один** ваш дом (`HOUSE_NEIGHBOR_RADIUS_CELLS`) — чтобы новые дома не ставились в отрыве от сети поселений.

### Ферма

- Ставится как `farmStage1`; стоимость в `PLACEMENT_COSTS`.
- Рост: очередь задач `#progressJobs`, вид `farm`. Каждые `FARM_GROWTH_STAGE_MS` (см. `client/constants/buildings-progress.js`) спрайт меняется по цепочке `FARM_GROWTH_STAGES` до `farmStage4`.
- Сбор: клик по **своей** созревшей ферме (`farmStage4`) начисляет `WHEAT_PER_FARM_HARVEST` пшеницы и сбрасывает поле в `farmStage1` с новым циклом роста.

### Магазин

- При выборе «Магазин» на землю ставится **`marketStage1`**; идёт таймер постройки (`MARKET_CONSTRUCTION_TOTAL_MS`, два этапа спрайта → готовый `market`).
- Пока стройка не завершена, клик по стадиям показывает тост «ещё строится».
- Готовый магазин **своего** игрока открывает модалку `UI.openMarketShop`: обмен пшеницы/дерева на золото и золота на пшеница/дерево по курсам из `client/constants/shop-exchange.js` (`SHOP_*`, предпросмотр строк — `getShopExchangePreviewLine`).
- Чужой магазин — тост «не ваш».

### Рыцари и дерево

- За срубленное дерево владелец рыцаря получает **`WOOD_PER_KNIGHT_TREE_CHOP`** дерева (`resources.js`); начисление в колбэке `deleteTreeAt`, переданном в `KnightSystem` из `Game`.

### Перерост леса (регенерация деревьев)

- Константы: `client/constants/forest-regrowth.js` — интервал `TREE_REGROW_INTERVAL_MS` (15 с между попытками), буфер от зданий `TREE_REGROW_BUILDING_BUFFER_TILES` (1 тайл по Чебышёву до любой клетки **не-дерева** в `state`).
- Логика: `client/game/forest-regrowth.js`, функция `tryRegrowOneTree(stateManager, worldWidthPx, worldHeightPx)`.
- В `Game.update` накапливается `#treeRegrowAccumMs`; каждые `TREE_REGROW_INTERVAL_MS` вызывается одна попытка посадить **одно** дерево.
- Новое дерево выбирается из тех же типов, что и генератор леса (`TreesGenerator.getTreeTileKeys()` / `pickRandomTreeTileKey`).
- Посадка только если весь отпечаток свободен, не в запретной зоне у замка (`isInsideCastleNoTreeMargin`), соблюдается буфер от построек и **минимальное расстояние Чебышёва** между клетками нового дерева и **любой** клеткой существующего леса равно **1** — лес расширяется только вплотную к уже стоящим деревьям (8-соседство по тайлам), без «островков» вдалеке.

### Где смотреть код

| Область | Файлы |
|--------|--------|
| Игровой цикл, ресурсы, постройки, магазин, ферма, рыцари | `client/game/game.js` |
| Курсы магазина и текст предпросмотра | `client/constants/shop-exchange.js`, `client/ui/ui.js` (модалка) |
| Стадии фермы и магазина | `client/constants/buildings-progress.js`, тайлы в `tiles.js` |
| Регенерация леса | `client/game/forest-regrowth.js`, `client/constants/forest-regrowth.js` |
