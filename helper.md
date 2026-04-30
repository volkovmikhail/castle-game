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
  Главная игровая система рыцарей (`KnightSystem`): спавн, выделение, выдача приказов, обновление состояний (`idle` / `move` / `chop`), путь до цели, коллизии между юнитами и с препятствиями, а также отрисовка спрайта и рамки выделения.

- `client/common/grid-path.js`  
  Общие функции навигации по сетке: проверка проходимости тайлов, A* (`findPathTiles`), проверка прямой видимости/проходимости (`hasStraightWalk`), утилиты для работы с деревьями (`isTreeSpriteType`, `neighborStandTilesForTree`).

- `client/constants/knight-atlas.js`  
  Константы визуала рыцаря: размер спрайта, набор кадров для бега/рубки/покоя, тайминги анимации и радиус коллизии между рыцарями (`KNIGHT_COLLISION_RADIUS`).

- Сущность `KnightUnit` (внутри `knight-system.js`)  
  Модель одного рыцаря: мировая позиция, режим, текущий маршрут, пиксельная цель, цель рубки, анимационные таймеры и направление отображения (`faceLeft`).
