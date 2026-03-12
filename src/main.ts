import { Game } from './game/Game';

// Bootstrap the game when the DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    const appContainer = document.getElementById('app');
    if (!appContainer) {
        throw new Error('Could not find #app element');
    }

    // Create canvas
    const canvas = document.createElement('canvas');
    appContainer.appendChild(canvas);

    // Read viewport size and set canvas layout size
    const resizeCanvas = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Initialize and start the game
    const game = new Game(canvas);
    game.start();
});
