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

        modal.appendChild(cardsContainer);
        this.container.appendChild(modal);
    }
}
