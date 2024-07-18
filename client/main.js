import { TILE_SIZE } from './constants/sizes.js';
import { BACKGROUND_COLOR } from './constants/colors.js';
import { tiles } from './constants/tiles.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

function clear() {
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function render() {
  clear();

  const tileMap = new Image();
  tileMap.src = 'assets/tilemap.png';
  tileMap.onload = () => {
    ctx.drawImage(
      tileMap,
      tiles.house.mapX,
      tiles.house.mapY,
      tiles.house.width,
      tiles.house.height,
      16, //pos x
      32, //pos y
      tiles.house.width,
      tiles.house.height
    );
  };
}

render();
