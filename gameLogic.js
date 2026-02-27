function getRandomInt() {
    return Math.floor(Math.random() * 6) + 1;
}

class Game {
    constructor(roomId, em) {
        this.roomId = roomId;
        this.em = em;
        this.heroes = [];
        this.dread = 0;
    }

    addHero(hero) {
        this.heroes.push(hero);
    }

    spendDread = (amount) => {
        if (amount > this.dread) {
            throw new Error('Not enough Dread to spend');
        }
        this.dread -= amount;
        return this.dread;
    }
}

class Hero {
    constructor({ name, archetypeId, heroPathId }) {
        this.name = name;
        this.archetypeId = archetypeId;
        this.hp = -1;
        this.hope = 0;
        this.qualities = [];
        this.dicePool = {
            hero: 0,
            red: 0,
            black: 0,
        };
        this.heroPathId = heroPathId;
    }
    // Roll your dice pool and return the results
    rollDice = () => {
        let heroDiceResults = []
        let redDiceResults = []
        let blackDiceResults = []
        let suns = 0;
        let skulls = 0;
        for (let i = 0 ; i < this.dicePool.hero; i++) {
            let result = getRandomInt();
            switch(result) {
                case 6:
                case 5:
                    suns += 1;
                    heroDiceResults.push("☀");
                    break;
                case 4:
                case 3:
                    heroDiceResults.push("⬜");
                    break;
                case 1:
                case 2:
                    skulls += 1;
                    heroDiceResults.push("💀");
                    break;
            }
        }
        for (let i = 0 ; i < this.dicePool.red; i++) {
            let result = getRandomInt();
            switch(result) {
                case 6:
                case 5:
                case 2:
                case 1:
                    skulls += 1;
                    redDiceResults.push("💀");
                    break;
                case 4:
                case 3:
                    redDiceResults.push("⬜");
                    break;
            }
        }
        for (let i = 0 ; i < this.dicePool.black; i++) {
            let result = getRandomInt();
            switch(result) {
                case 6:
                case 5:
                    skulls += 2;
                    blackDiceResults.push("💀💀");
                    break;
                case 4:
                case 3:
                    blackDiceResults.push("⬜");
                    break;
                case 1:
                case 2:
                    skulls += 1;
                    blackDiceResults.push("💀");
                    break;
            }
        }
        return {
            heroDiceResults,
            redDiceResults,
            blackDiceResults,
            suns,
            skulls
        }
    }

    forcedRoll = () => {
        let success = true;
        let results = this.rollDice();
        
        if (results.skulls > results.suns) {
            success = false;
        }
        results.success = success;
        return results;
    }

    // Perform an Action Roll, adding one Hero Die to the pool
    actionRoll = () => {
        this.dicePool.hero++;
        const diceResults = this.rollDice();
        this.hope += diceResults.suns;
        return diceResults;
    }

    resetDicePool = () => {
        this.dicePool = {
            hero: 0,
            red: 0,
            black: 0,
        };
    }
    
    replaceForRedDie = () => {
        if (this.dicePool.hero > 0) {
            this.dicePool.hero--;
            this.dicePool.red++;
        }
        return this.dicePool;
    }

    replaceForBlackDie = () => {
        if (this.dicePool.hero > 0) {
            this.dicePool.hero--;
            this.dicePool.black++;
        }
        return this.dicePool;
    }

    addRedDie = () => {
        this.dicePool.red++;
        return this.dicePool;
    }

    addBlackDie = () => {
        this.dicePool.black++;
        return this.dicePool;
    }

    spendHope = (amount) => {
        if (amount > this.hope) {
            throw new Error('Not enough Hope to spend');
        }
        this.hope -= amount;
        return this.hope;
    }

}

export { Hero, Game };