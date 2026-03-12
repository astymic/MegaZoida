import { Player } from './Player';

export class UIManager {
    private container: HTMLDivElement;

    constructor() {
        this.container = document.createElement('div');
        this.container.className = 'ui-layer';
        this.container.style.position = 'absolute';
        this.container.style.top = '0';
        this.container.style.left = '0';
        this.container.style.width = '100%';
        this.container.style.height = '100%';
        this.container.style.pointerEvents = 'none'; // let clicks pass through mainly
        this.container.style.display = 'flex';
        this.container.style.justifyContent = 'center';
        this.container.style.alignItems = 'center';
        this.container.style.fontFamily = 'sans-serif';

        const app = document.getElementById('app');
        if (app) app.appendChild(this.container);
    }

    public showLevelUp(player: Player, onChoiceMade: () => void) {
        this.container.innerHTML = '';
        this.container.style.pointerEvents = 'auto'; // intercept clicks
        this.container.style.backgroundColor = 'rgba(0, 0, 0, 0.7)'; // Dim background

        const menu = document.createElement('div');
        menu.style.background = '#222';
        menu.style.padding = '20px';
        menu.style.borderRadius = '10px';
        menu.style.border = '2px solid #555';
        menu.style.textAlign = 'center';

        const title = document.createElement('h2');
        title.innerText = 'Level Up!';
        title.style.color = '#fff';
        title.style.marginBottom = '20px';
        menu.appendChild(title);

        const buffs = [
            { name: '+10% Movement Speed', apply: () => player.moveSpeed *= 1.1 },
            { name: '+25 Max HP', apply: () => { player.maxHp += 25; player.hp += 25; } },
            { name: '+5 Attack Damage', apply: () => player.attackDamage += 5 },
            { name: '+10% Attack Speed', apply: () => player.attackSpeed *= 1.1 },
            { name: 'Full Heal', apply: () => player.hp = player.maxHp },
        ];

        // Pick 3 random
        const shuffled = buffs.sort(() => 0.5 - Math.random());
        const choices = shuffled.slice(0, 3);

        const choicesContainer = document.createElement('div');
        choicesContainer.style.display = 'flex';
        choicesContainer.style.gap = '10px';
        choicesContainer.style.flexDirection = 'column';

        choices.forEach(choice => {
            const btn = document.createElement('button');
            btn.innerText = choice.name;
            btn.style.padding = '15px 20px';
            btn.style.fontSize = '16px';
            btn.style.cursor = 'pointer';
            btn.style.backgroundColor = '#3498db';
            btn.style.color = '#fff';
            btn.style.border = 'none';
            btn.style.borderRadius = '5px';
            btn.style.transition = 'background 0.2s';

            btn.onmouseover = () => btn.style.backgroundColor = '#2980b9';
            btn.onmouseout = () => btn.style.backgroundColor = '#3498db';

            btn.onclick = () => {
                choice.apply();
                this.closeUI();
                onChoiceMade();
            };
            choicesContainer.appendChild(btn);
        });

        menu.appendChild(choicesContainer);
        this.container.appendChild(menu);
    }

    private closeUI() {
        this.container.innerHTML = '';
        this.container.style.pointerEvents = 'none';
        this.container.style.backgroundColor = 'transparent';
    }

    public showWeaponChest(_player: Player, onChoiceMade: () => void) {
        this.container.innerHTML = '';
        this.container.style.pointerEvents = 'auto'; // intercept clicks
        this.container.style.backgroundColor = 'rgba(0, 0, 0, 0.7)'; // Dim background

        const menu = document.createElement('div');
        menu.style.background = '#8e44ad';
        menu.style.padding = '20px';
        menu.style.borderRadius = '10px';
        menu.style.border = '2px solid #f1c40f';
        menu.style.textAlign = 'center';

        const title = document.createElement('h2');
        title.innerText = 'Chest Opened!';
        title.style.color = '#fff';
        title.style.marginBottom = '20px';
        menu.appendChild(title);

        // Placeholder: Need to import weapons if we actually instantiate them here.
        // For now, let's just use Game's logic or a simple callback. But since UIManager is simple, we will just dispatch the selection.
        // We will just offer 1 basic choice for now to test the logic.
        // Real implementation would receive a list of Weapon objects to choose from.
        const btn = document.createElement('button');
        btn.innerText = 'Take Basic Sword (Test)';
        btn.style.padding = '15px 20px';
        btn.style.fontSize = '16px';
        btn.style.cursor = 'pointer';
        btn.style.backgroundColor = '#f1c40f';
        btn.style.color = '#000';
        btn.style.border = 'none';
        btn.style.borderRadius = '5px';
        btn.style.transition = 'background 0.2s';

        btn.onmouseover = () => btn.style.backgroundColor = '#e67e22';
        btn.onmouseout = () => btn.style.backgroundColor = '#f1c40f';

        btn.onclick = () => {
            // Game logic will add the actual weapon, so we just signal choice made
            this.closeUI();
            onChoiceMade();
        };
        menu.appendChild(btn);

        this.container.appendChild(menu);
    }
}
