export class Controls {
  /**
   * Creates an instance of Controls.
   *
   * @constructor
   * @param {{ canvas: HTMLElement; }} params
   */
  constructor({ canvas }) {
    this.canvas = canvas;

    //TODO: Delete this text default function
    this.onMove = ({ x, y }) => {
      console.log(`X: ${x.toFixed(2)}, Y: ${y.toFixed(2)}`);
    };
  }

  init() {
    this.canvas.addEventListener('mousemove', (event) => {
      const { x, y } = this.calculateCords(event);

      this.onMove({ x, y });
    });
  }

  calculateCords(event) {
    const rect = this.canvas.getBoundingClientRect();

    //calculate canvas relative cords
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    return { x, y };
  }

  setOnMove(onMove) {
    this.onMove = onMove;
  }
}
