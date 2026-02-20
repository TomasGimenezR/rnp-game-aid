function getRandomInt() {
    return Math.floor(Math.random() * 6) + 1;
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
        return this.rollDice();
    }

}

export { Hero };