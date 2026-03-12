import { Player } from './Player';

export class UIManager {
    private container: HTMLDivElement;

    constructor() {
        this.container = document.createElement('div');
        this.container.id = 'ui-container';
        this.container.style.position = 'absolute';
        this.container.style.top = '0';
        this.container.style.left = '0';
        this.container.style.width = '100vw';
        this.container.style.height = '100vh';
        this.container.style.pointerEvents = 'none'; // Only block when UI active
        this.container.style.display = 'flex';
        this.container.style.justifyContent = 'center';
        this.container.style.alignItems = 'center';
        this.container.style.zIndex = '1000';
        document.body.appendChild(this.container);
    }

    public showMainMenu(onSelectHero: (type: 'human' | 'knight' | 'archer') => void) {
        this.container.innerHTML = '';
        this.container.style.pointerEvents = 'auto';
        this.container.style.backgroundColor = 'rgba(0, 0, 0, 0.9)'; // Dark background

        const menu = document.createElement('div');
        menu.style.background = '#2c3e50';
        menu.style.padding = '40px';
        menu.style.borderRadius = '15px';
        menu.style.border = '4px solid #f1c40f';
        menu.style.textAlign = 'center';
        menu.style.color = '#fff';

        const title = document.createElement('h1');
        title.innerText = 'MEGAZOIDA';
        title.style.fontSize = '48px';
        title.style.margin = '0 0 10px 0';
        title.style.color = '#e74c3c';
        title.style.textShadow = '2px 2px 0 #c0392b, -2px -2px 0 #c0392b, 2px -2px 0 #c0392b, -2px 2px 0 #c0392b';
        menu.appendChild(title);

        const sub = document.createElement('p');
        sub.innerText = 'Choose Your Hero';
        sub.style.marginBottom = '30px';
        menu.appendChild(sub);

        const grid = document.createElement('div');
        grid.style.display = 'flex';
        grid.style.gap = '20px';
        grid.style.justifyContent = 'center';

        const heroes = [
            { id: 'human', name: '🧍 Human', desc: 'Balanced warrior.\nStandard stats.' },
            { id: 'knight', name: '🛡️ Knight', desc: 'Tanky bruiser.\nHigh HP & Damage.\nSlow Speed.' },
            { id: 'archer', name: '🏹 Archer', desc: 'Swift tracker.\nFast Move Speed.\nRanged Attack Speed++' }
        ];

        heroes.forEach(h => {
            const btn = document.createElement('button');
            btn.style.padding = '20px';
            btn.style.backgroundColor = '#34495e';
            btn.style.color = '#fff';
            btn.style.border = '2px solid #7f8c8d';
            btn.style.borderRadius = '10px';
            btn.style.cursor = 'pointer';
            btn.style.display = 'flex';
            btn.style.flexDirection = 'column';
            btn.style.alignItems = 'center';
            btn.style.width = '150px';

            btn.innerHTML = `<h3 style="margin:0 0 10px 0">${h.name}</h3><p style="font-size:12px; margin:0">${h.desc.replace(/\n/g, '<br>')}</p>`;

            btn.onmouseenter = () => btn.style.backgroundColor = '#2980b9';
            btn.onmouseleave = () => btn.style.backgroundColor = '#34495e';

            btn.onclick = () => {
                this.closeUI();
                onSelectHero(h.id as any);
            };

            grid.appendChild(btn);
        });

        menu.appendChild(grid);
        this.container.appendChild(menu);
    }

    public showGameOver(level: number, coins: number, kills: number, onRestart: () => void, onMenu: () => void) {
        this.container.innerHTML = '';
        this.container.style.pointerEvents = 'auto';
        this.container.style.backgroundColor = 'rgba(192, 57, 43, 0.7)'; // Bloody background

        const menu = document.createElement('div');
        menu.style.background = '#2c3e50';
        menu.style.padding = '40px';
        menu.style.borderRadius = '10px';
        menu.style.border = '2px solid #e74c3c';
        menu.style.textAlign = 'center';
        menu.style.color = '#fff';

        menu.innerHTML = `
            <h1 style="color: #e74c3c; font-size: 40px; margin-top: 0;">YOU DIED</h1>
            <div style="font-size: 20px; line-height: 1.6; margin-bottom: 30px;">
                <p>Level Reached: <strong>${level}</strong></p>
                <p>Enemies Killed: <strong>${kills} 💀</strong></p>
                <p>Gold Earned: <strong>${coins} 🪙</strong></p>
            </div>
        `;

        const btnRow = document.createElement('div');
        btnRow.style.display = 'flex';
        btnRow.style.gap = '20px';
        btnRow.style.justifyContent = 'center';

        const retry = document.createElement('button');
        retry.innerText = '🔄 Restart Run';
        retry.style.padding = '15px 30px';
        retry.style.backgroundColor = '#27ae60';
        retry.style.color = '#fff';
        retry.style.border = 'none';
        retry.style.borderRadius = '5px';
        retry.style.cursor = 'pointer';
        retry.onclick = () => {
            this.closeUI();
            onRestart();
        };

        const mainMenu = document.createElement('button');
        mainMenu.innerText = '☰ Main Menu';
        mainMenu.style.padding = '15px 30px';
        mainMenu.style.backgroundColor = '#7f8c8d';
        mainMenu.style.color = '#fff';
        mainMenu.style.border = 'none';
        mainMenu.style.borderRadius = '5px';
        mainMenu.style.cursor = 'pointer';
        mainMenu.onclick = () => {
            this.closeUI();
            onMenu();
        };

        btnRow.appendChild(retry);
        btnRow.appendChild(mainMenu);
        menu.appendChild(btnRow);

        this.container.appendChild(menu);
    }

    public showLevelUp(player: Player, onChoiceMade: () => void) {
        this.container.innerHTML = ''; // clear
        this.container.style.pointerEvents = 'auto'; // intercept clicks
        this.container.style.backgroundColor = 'rgba(0, 0, 0, 0.7)'; // Dim background

        const menu = document.createElement('div');
        menu.style.background = '#2c3e50';
        menu.style.padding = '20px';
        menu.style.borderRadius = '10px';
        menu.style.border = '2px solid #f1c40f';
        menu.style.textAlign = 'center';

        const title = document.createElement('h2');
        title.innerText = `Level ${player.level} reached! Choose a Buff:`;
        title.style.color = '#fff';
        title.style.marginBottom = '20px';
        menu.appendChild(title);

        // Provide 3 random buffs
        const possibleBuffs = [
            { name: '+ Max HP', apply: () => player.maxHp += 20 },
            { name: '+ Movement Speed', apply: () => player.moveSpeed += 20 },
            { name: '+ Attack Speed', apply: () => player.attackSpeed += 0.2 },
            { name: '+ Attack Damage', apply: () => player.attackDamage += 5 },
            { name: '+ Regen HP (Insta Heal)', apply: () => player.hp += 50 }
        ];

        // Shuffle and pick 3
        const shuffled = possibleBuffs.sort(() => 0.5 - Math.random());
        const choices = shuffled.slice(0, 3);

        choices.forEach(choice => {
            const btn = document.createElement('button');
            btn.innerText = choice.name;
            btn.style.display = 'block';
            btn.style.width = '100%';
            btn.style.padding = '10px';
            btn.style.marginBottom = '10px';
            btn.style.fontSize = '16px';
            btn.style.cursor = 'pointer';
            btn.style.backgroundColor = '#3498db';
            btn.style.color = '#fff';
            btn.style.border = 'none';
            btn.style.borderRadius = '5px';

            btn.onclick = () => {
                choice.apply();
                this.closeUI();
                onChoiceMade();
            };

            menu.appendChild(btn);
        });

        this.container.appendChild(menu);
    }

    private closeUI() {
        this.container.innerHTML = '';
        this.container.style.pointerEvents = 'none';
        this.container.style.backgroundColor = 'transparent';
    }

    public showWeaponChest(_player: Player, weapons: any[], onChoiceMade: (w: any) => void) {
        this.container.innerHTML = '';
        this.container.style.pointerEvents = 'auto';
        this.container.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';

        const modal = document.createElement('div');
        modal.style.background = '#34495e';
        modal.style.padding = '30px';
        modal.style.borderRadius = '10px';
        modal.style.textAlign = 'center';
        modal.style.color = '#fff';

        const title = document.createElement('h2');
        title.innerText = 'Choose your new weapon!';
        modal.appendChild(title);

        const cardsContainer = document.createElement('div');
        cardsContainer.style.display = 'flex';
        cardsContainer.style.gap = '20px';
        cardsContainer.style.marginTop = '20px';

        weapons.forEach((weapon) => {
            const btn = document.createElement('button');
            btn.style.padding = '15px';
            btn.style.backgroundColor = '#8e44ad'; // Chest purple
            btn.style.color = 'white';
            btn.style.border = 'none';
            btn.style.borderRadius = '5px';
            btn.style.cursor = 'pointer';
            btn.style.display = 'flex';
            btn.style.flexDirection = 'column';
            btn.style.alignItems = 'center';

            const icon = document.createElement('div');
            icon.innerText = weapon.data.icon;
            icon.style.fontSize = '32px';

            const text = document.createElement('div');
            text.innerText = `${weapon.data.name}\nDamage x${weapon.data.damageMult.toFixed(1)}\nSpeed x${weapon.data.speedMult.toFixed(1)}`;

            btn.appendChild(icon);
            btn.appendChild(text);

            btn.onclick = () => {
                this.closeUI();
                onChoiceMade(weapon);
            };
            cardsContainer.appendChild(btn);
        });

        const skipBtn = document.createElement('button');
        skipBtn.innerText = 'Skip';
        skipBtn.style.padding = '10px 20px';
        skipBtn.style.marginTop = '20px';
        skipBtn.style.backgroundColor = '#e74c3c';
        skipBtn.style.color = 'white';
        skipBtn.style.border = 'none';
        skipBtn.style.borderRadius = '5px';
        skipBtn.style.cursor = 'pointer';

        skipBtn.onclick = () => {
            this.closeUI();
            onChoiceMade(null); // Return null for skip
        };

        modal.appendChild(cardsContainer);
        modal.appendChild(skipBtn);
        this.container.appendChild(modal);
    }
}
