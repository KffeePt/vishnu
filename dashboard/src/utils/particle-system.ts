export interface ParticleOptions {
  numberOfBalls?: number;
  maxActiveBalls?: number;
  ballColors?: string[];
  ballSpeedMin?: number;
  ballSpeedMax?: number;
}

const DEFAULT_BALL_COLORS = ['#0c7c7d', '#139e83', '#07c9a3', '#11ddcf', '#77d4d4'];
const DEFAULT_NUM_BALLS = 20;
const DEFAULT_MAX_ACTIVE_BALLS = 50;
const DEFAULT_BALL_SPEED_MIN = 30;
const DEFAULT_BALL_SPEED_MAX = 60;

let activeBallCount = 0;

export const createExplodingBalls = (
  cursorX: number,
  cursorY: number,
  options: ParticleOptions = {}
) => {
  const {
    numberOfBalls = DEFAULT_NUM_BALLS,
    maxActiveBalls = DEFAULT_MAX_ACTIVE_BALLS,
    ballColors = DEFAULT_BALL_COLORS,
    ballSpeedMin = DEFAULT_BALL_SPEED_MIN,
    ballSpeedMax = DEFAULT_BALL_SPEED_MAX,
  } = options;

  for (let i = 0; i < numberOfBalls; i++) {
    if (activeBallCount >= maxActiveBalls) {
      break;
    }

    const ball = document.createElement('div');
    ball.className = 'exploding-ball';
    ball.style.position = 'fixed';
    ball.style.left = `${cursorX}px`;
    ball.style.top = `${cursorY}px`;
    ball.style.backgroundColor = ballColors[Math.floor(Math.random() * ballColors.length)];

    document.body.appendChild(ball);
    activeBallCount++;

    const angle = Math.random() * 2 * Math.PI;
    const speed = Math.random() * (ballSpeedMax - ballSpeedMin) + ballSpeedMin;

    const x = Math.cos(angle) * speed;
    const y = Math.sin(angle) * speed;

    ball.style.setProperty('--x', `${x}px`);
    ball.style.setProperty('--y', `${y}px`);

    requestAnimationFrame(() => {
      ball.classList.add('animate-explode');
    });

    ball.addEventListener('animationend', () => {
      if (ball.parentNode) {
        ball.parentNode.removeChild(ball);
      }
      activeBallCount--;
    });
  }
};