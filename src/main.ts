import { Game } from './game/Game';
import { AssetManager } from './game/AssetManager';

// Bootstrap the game when the DOM is loaded
window.addEventListener('DOMContentLoaded', async () => {
    const appContainer = document.getElementById('app');
    if (!appContainer) {
        throw new Error('Could not find #app element');
    }

    // Prepare a simple loading screen
    const loadingDiv = document.createElement('div');
    loadingDiv.style.position = 'absolute';
    loadingDiv.style.top = '50%';
    loadingDiv.style.left = '50%';
    loadingDiv.style.transform = 'translate(-50%, -50%)';
    loadingDiv.style.color = 'white';
    loadingDiv.style.fontFamily = 'sans-serif';
    loadingDiv.innerHTML = '<h2>Loading 3D Assets...</h2>';
    appContainer.appendChild(loadingDiv);

    try {
        await AssetManager.preloadAll((progress) => {
            loadingDiv.innerHTML = `<h2>Loading 3D Assets... ${Math.round(progress * 100)}%</h2>`;
        });
    } catch (err) {
        console.error("Failed to preload assets:", err);
    }

    appContainer.removeChild(loadingDiv);

    // Initialize and start the game with the container
    const game = new Game(appContainer);
    game.start();
});
