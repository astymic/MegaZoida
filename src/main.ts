import { Game } from './game/Game';

// Bootstrap the game when the DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    const appContainer = document.getElementById('app');
    if (!appContainer) {
        throw new Error('Could not find #app element');
    }

    // Initialize and start the game with the container
    const game = new Game(appContainer);
    game.start();
});
